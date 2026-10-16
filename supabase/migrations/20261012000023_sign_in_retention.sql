-- Plan 2b final review I1 (and M7): bounded retention for sign-in records.
--
-- Sign-in records hold plain email addresses and numbers (email_requests.email_norm, otp_requests.phone_e164,
-- otp_verify_attempts.phone_e164 = E.164 or 'email:' || address), and every "Email me a code" for a new address
-- leaves an unconfirmed auth.users row holding the address until it's used. The privacy notice now says so and
-- promises limits, which this enforces:
--   * private.tidy_sign_in_records(): deletes email_requests, otp_requests and otp_verify_attempts rows older than
--     30 days, and abandoned email accounts (private.abandoned_email_account: never confirmed, never signed in, no
--     profile, not an admin) older than 24 hours that have no reviews (at most 500 accounts a run). Returns counts.
--   * public.tidy_sign_in_records(): the same, for the admin ("Tidy sign-in records") or the service role.
--   * email_gate (new body): runs the tidy at most once an hour (private.housekeeping), purges its own rows after
--     30 days (was 35), and also takes a site-wide lock so concurrent requests can't overshoot the daily and
--     monthly caps (M7). Its fallback daily cap is 80 (Resend's free tier is 100 a day).
-- Re-runnable.

-- ---------------------------------------------------------------- housekeeping (when a job last ran)
create table if not exists private.housekeeping (
  job text primary key,
  last_run timestamptz not null default '-infinity'
);
revoke all on private.housekeeping from public, anon, authenticated, service_role;
insert into private.housekeeping (job) values ('tidy_sign_in_records') on conflict do nothing;

-- ---------------------------------------------------------------- the tidy
create or replace function private.tidy_sign_in_records() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email int;
  v_phone int;
  v_attempts int;
  v_accounts int;
begin
  delete from public.email_requests where created_at < now() - interval '30 days';
  get diagnostics v_email = row_count;
  delete from public.otp_requests where created_at < now() - interval '30 days';
  get diagnostics v_phone = row_count;
  delete from public.otp_verify_attempts where created_at < now() - interval '30 days';
  get diagnostics v_attempts = row_count;
  -- Their identities and sessions go with them (auth's own cascades); they have no profile, so nothing else does.
  delete from auth.users u
  where u.id in (
    select a.id from auth.users a
    where a.deleted_at is null
      and a.created_at < now() - interval '24 hours'
      and private.abandoned_email_account(a.id)
      and not exists (select 1 from public.reviews r where r.reviewer_id = a.id)
    order by a.created_at
    limit 500
  );
  get diagnostics v_accounts = row_count;
  update private.housekeeping set last_run = now() where job = 'tidy_sign_in_records';
  return jsonb_build_object('email_requests', v_email, 'phone_requests', v_phone, 'code_attempts', v_attempts,
                            'unused_accounts', v_accounts);
end;
$$;
revoke execute on function private.tidy_sign_in_records() from public, anon, authenticated, service_role;

create or replace function public.tidy_sign_in_records() returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return private.tidy_sign_in_records();
end;
$$;
revoke execute on function public.tidy_sign_in_records() from public, anon, authenticated;
grant execute on function public.tidy_sign_in_records() to authenticated, service_role;

-- ---------------------------------------------------------------- email_gate (new body)
create or replace function public.email_gate(p_email text, p_ip_hash text)
returns table (request_id bigint, verdict text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_norm text := private.normalise_email(p_email);
  v_typed text := lower(btrim(coalesce(p_email, '')));
  v_ip text := coalesce(p_ip_hash, '');
  v_limits jsonb;
  v_day_start timestamptz;
  v_month_start timestamptz;
  v_a15 int;
  v_a24 int;
  v_i1 int;
  v_i24 int;
  v_day int;
  v_month int;
  v_outcome text := 'pending';
  v_verdict text := 'ok';
  v_id bigint;
begin
  -- Address lock first, then the site-wide one (the caps), always in that order.
  perform pg_advisory_xact_lock(hashtext('email_gate:' || coalesce(v_norm, '')));
  perform pg_advisory_xact_lock(hashtext('email_gate:cap'));

  -- At most once an hour, whoever asks first tidies old sign-in records and unused accounts.
  update private.housekeeping set last_run = now()
  where job = 'tidy_sign_in_records' and last_run < now() - interval '1 hour';
  if found then
    perform private.tidy_sign_in_records();
  end if;
  delete from public.email_requests where created_at < now() - interval '30 days';

  select value into v_limits from public.settings where key = 'email_limits';
  v_limits := coalesce(v_limits, '{}'::jsonb);

  select count(*) filter (where created_at > now() - interval '15 minutes'),
         count(*) filter (where created_at > now() - interval '24 hours')
    into v_a15, v_a24
  from public.email_requests where v_norm is not null and email_norm = v_norm;
  select count(*) filter (where created_at > now() - interval '1 hour'),
         count(*) filter (where created_at > now() - interval '24 hours')
    into v_i1, v_i24
  from public.email_requests where ip_hash = v_ip;

  -- Today and this calendar month in Bolton; only 'sent' rows used up Resend's allowance.
  v_day_start := date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London';
  v_month_start := date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London';
  select count(*) filter (where created_at >= v_day_start), count(*)
    into v_day, v_month
  from public.email_requests where outcome = 'sent' and created_at >= v_month_start;

  if v_norm is null then
    v_outcome := 'invalid';
    v_verdict := 'invalid';
  elsif private.is_admin_email(v_typed) or exists (
    select 1 from public.settings s, jsonb_array_elements_text(s.value) e
    where s.key = 'admin_emails' and jsonb_typeof(s.value) = 'array' and private.normalise_email(e) = v_norm
  ) then
    v_outcome := 'admin_address';
    v_verdict := 'admin_address';
  elsif private.email_domain_blocked(v_typed) then
    v_outcome := 'blocked_domain';
    v_verdict := 'blocked_domain';
  elsif exists (
    select 1 from auth.users u
    where u.deleted_at is null and coalesce(u.email, '') <> ''
      and private.normalise_email(u.email) = v_norm and lower(u.email) <> v_typed
      and not private.abandoned_email_account(u.id)
  ) then
    v_outcome := 'address_taken';
    v_verdict := 'address_taken';
  elsif v_a15 >= coalesce((v_limits ->> 'address_15m')::int, 3) or v_a24 >= coalesce((v_limits ->> 'address_24h')::int, 6) then
    v_outcome := 'limited_address';
    v_verdict := 'address_limited';
  elsif v_i1 >= coalesce((v_limits ->> 'ip_1h')::int, 10) or v_i24 >= coalesce((v_limits ->> 'ip_24h')::int, 20) then
    v_outcome := 'limited_ip';
    v_verdict := 'ip_limited';
  elsif v_day >= coalesce((v_limits ->> 'daily_cap')::int, 80) or v_month >= coalesce((v_limits ->> 'monthly_cap')::int, 2900) then
    v_outcome := 'cap_reached';
    v_verdict := 'cap_reached';
  end if;

  insert into public.email_requests (email_norm, ip_hash, outcome) values (coalesce(v_norm, ''), v_ip, v_outcome)
  returning id into v_id;
  return query select v_id, v_verdict;
end;
$$;
revoke execute on function public.email_gate(text, text) from public, anon, authenticated;
grant execute on function public.email_gate(text, text) to service_role;
