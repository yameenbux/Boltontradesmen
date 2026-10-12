-- Owner decisions on the minors final review 2 left open. Re-runnable (if not exists / create or replace /
-- on conflict do nothing; grants as before).
--   M3  The group code allows 5 wrong tries per person in 24 hours (settings.group_code_limits). After that,
--       every try is refused ('group_code_limit'), even the right code, until the oldest wrong try is 24 hours
--       old. Wrong tries are recorded in group_code_attempts (RLS on, no grants; kept 2 days). Refused tries are
--       not recorded, so they don't extend the lock. complete_onboarding now answers a wrong or locked code with
--       {"error": ...} instead of raising, so the wrong try it records isn't rolled back with the error.
--   M11 Every Twilio Lookup counts towards the monthly SMS cap. A Lookup happens for each request otp_gate lets
--       through (any outcome except limited_number / limited_ip / cap_reached), at settings.lookup_cost_gbp
--       (default £0.01). This month's spend = texts sent x sms_cost_per_send_gbp + Lookups x lookup_cost_gbp.
--   M5  Proof files are deleted 12 months after the admin checks them (settings.proof_retention_months).
--       proof_files_due lists them; the app deletes each file from Storage, then mark_proof_files_deleted sets
--       review_proofs.file_deleted_at. The row and its outcome stay, so a Verified job stays verified.
--       Both are for the admin or the service role. Run from the admin Proofs page until Plan 5's scheduled jobs.

-- ---------------------------------------------------------------- settings
insert into public.settings (key, value) values
  ('group_code_limits', '{"wrong_24h":5}'::jsonb),
  ('lookup_cost_gbp', '0.01'::jsonb),
  ('proof_retention_months', '12'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- M3: group code attempts
create table if not exists public.group_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists group_code_attempts_user_idx on public.group_code_attempts (user_id, created_at);
alter table public.group_code_attempts enable row level security;
revoke all on public.group_code_attempts from public, anon, authenticated;

-- 'ok' (right code), 'wrong' (recorded) or 'limit' (refused, not recorded).
create or replace function private.check_group_code(p_uid uuid, p_code text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
  v_limit int;
  v_wrong int;
begin
  perform pg_advisory_xact_lock(hashtext('group_code:' || p_uid::text));
  delete from public.group_code_attempts where created_at < now() - interval '2 days';

  select coalesce((s.value ->> 'wrong_24h')::int, 5) into v_limit from public.settings s where s.key = 'group_code_limits';
  v_limit := coalesce(v_limit, 5);
  select count(*) into v_wrong from public.group_code_attempts
  where user_id = p_uid and created_at > now() - interval '24 hours';
  if v_wrong >= v_limit then
    return 'limit';
  end if;

  select s.value #>> '{}' into v_code from public.settings s where s.key = 'group_code';
  if v_code is not null and nullif(btrim(p_code), '') is not null and lower(btrim(p_code)) = lower(btrim(v_code)) then
    return 'ok';
  end if;
  insert into public.group_code_attempts (user_id) values (p_uid);
  return 'wrong';
end;
$$;
revoke execute on function private.check_group_code(uuid, text) from public, anon, authenticated;

create or replace function public.set_group_code(p_code text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_check text;
begin
  if v_uid is null or nullif(btrim(p_code), '') is null then
    return false;
  end if;
  v_check := private.check_group_code(v_uid, p_code);
  if v_check = 'limit' then
    raise exception 'group_code_limit';
  end if;
  if v_check <> 'ok' then
    return false;
  end if;
  update public.profiles
  set group_member_at = coalesce(group_member_at, now())
  where user_id = v_uid and deleted_at is null;
  return found;
end;
$$;

create or replace function public.complete_onboarding(p_display_name text, p_district text, p_group_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_check text;
  v_member timestamptz;
  v_line_type text;
  v_checked_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if nullif(btrim(p_group_code), '') is not null then
    v_check := private.check_group_code(v_uid, p_group_code);
    if v_check = 'limit' then
      return jsonb_build_object('error', 'group_code_limit');
    elsif v_check <> 'ok' then
      return jsonb_build_object('error', 'bad_group_code');
    end if;
    v_member := now();
  end if;

  select phone into v_phone from auth.users where id = v_uid;
  if coalesce(v_phone, '') <> '' then
    select r.line_type, r.created_at into v_line_type, v_checked_at
    from public.otp_requests r
    where r.phone_e164 = '+' || ltrim(v_phone, '+') and r.outcome = 'sent'
    order by r.created_at desc, r.id desc
    limit 1;
  end if;

  insert into public.profiles (user_id, role, display_name, postcode_district, line_type, line_type_checked_at, group_member_at)
  values (v_uid, 'resident', p_display_name, upper(nullif(btrim(p_district), '')), v_line_type, v_checked_at, v_member)
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    postcode_district = excluded.postcode_district,
    line_type = coalesce(excluded.line_type, public.profiles.line_type),
    line_type_checked_at = coalesce(excluded.line_type_checked_at, public.profiles.line_type_checked_at),
    group_member_at = coalesce(public.profiles.group_member_at, excluded.group_member_at);

  perform public.claim_provider_listings();
  return public.my_account();
end;
$$;

revoke execute on function public.set_group_code(text) from public, anon;
grant execute on function public.set_group_code(text) to authenticated;
revoke execute on function public.complete_onboarding(text, text, text) from public, anon;
grant execute on function public.complete_onboarding(text, text, text) to authenticated;

-- ---------------------------------------------------------------- M11: Lookups count towards the cap
create or replace function public.otp_gate(p_phone text, p_ip_hash text)
returns table (request_id bigint, verdict text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_limits jsonb;
  v_cap numeric;
  v_cost numeric;
  v_lookup_cost numeric;
  v_month_start timestamptz;
  v_n15 int;
  v_n24 int;
  v_i1 int;
  v_i24 int;
  v_sent int;
  v_lookups int;
  v_outcome text := 'pending';
  v_verdict text := 'ok';
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_phone));
  delete from public.otp_requests where created_at < now() - interval '30 days';

  select value into v_limits from public.settings where key = 'otp_limits';
  v_limits := coalesce(v_limits, '{}'::jsonb);
  select (value #>> '{}')::numeric into v_cap from public.settings where key = 'sms_monthly_cap_gbp';
  select (value #>> '{}')::numeric into v_cost from public.settings where key = 'sms_cost_per_send_gbp';
  select (value #>> '{}')::numeric into v_lookup_cost from public.settings where key = 'lookup_cost_gbp';

  select count(*) filter (where created_at > now() - interval '15 minutes'),
         count(*) filter (where created_at > now() - interval '24 hours')
    into v_n15, v_n24
  from public.otp_requests where phone_e164 = p_phone;
  select count(*) filter (where created_at > now() - interval '1 hour'),
         count(*) filter (where created_at > now() - interval '24 hours')
    into v_i1, v_i24
  from public.otp_requests where ip_hash = p_ip_hash;

  -- This calendar month in Bolton. Every request the gate let through got a Lookup; only 'sent' got a text.
  v_month_start := date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London';
  select count(*) filter (where outcome = 'sent'),
         count(*) filter (where outcome not in ('limited_number', 'limited_ip', 'cap_reached'))
    into v_sent, v_lookups
  from public.otp_requests where created_at >= v_month_start;

  if v_n15 >= coalesce((v_limits ->> 'number_15m')::int, 3) or v_n24 >= coalesce((v_limits ->> 'number_24h')::int, 6) then
    v_outcome := 'limited_number';
    v_verdict := 'number_limited';
  elsif v_i1 >= coalesce((v_limits ->> 'ip_1h')::int, 10) or v_i24 >= coalesce((v_limits ->> 'ip_24h')::int, 20) then
    v_outcome := 'limited_ip';
    v_verdict := 'ip_limited';
  elsif v_sent * coalesce(v_cost, 0.10) + v_lookups * coalesce(v_lookup_cost, 0.01) >= coalesce(v_cap, 20) then
    v_outcome := 'cap_reached';
    v_verdict := 'cap_reached';
  end if;

  insert into public.otp_requests (phone_e164, ip_hash, outcome) values (p_phone, p_ip_hash, v_outcome)
  returning id into v_id;
  return query select v_id, v_verdict;
end;
$$;
revoke execute on function public.otp_gate(text, text) from public, anon, authenticated;
grant execute on function public.otp_gate(text, text) to service_role;

-- ---------------------------------------------------------------- M5: proof file retention
alter table public.review_proofs add column if not exists file_deleted_at timestamptz;

create or replace function private.proof_retention_cutoff() returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select now() - make_interval(months => coalesce(
    (select (value #>> '{}')::int from public.settings where key = 'proof_retention_months'), 12));
$$;
revoke execute on function private.proof_retention_cutoff() from public, anon, authenticated;

create or replace function private.require_admin_or_service() returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'not admin' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.require_admin_or_service() from public, anon, authenticated;

-- Proofs checked (accepted or rejected) more than the retention period ago whose file is still stored.
create or replace function public.proof_files_due(p_limit int default 100)
returns table (id uuid, storage_path text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_admin_or_service();
  return query
    select pr.id, pr.storage_path
    from public.review_proofs pr
    where pr.checked_at is not null and pr.checked_at <= private.proof_retention_cutoff() and pr.file_deleted_at is null
    order by pr.checked_at, pr.id
    limit greatest(coalesce(p_limit, 100), 1);
end;
$$;

-- Called after the files are gone from Storage. Only marks proofs that are really due. Returns how many.
create or replace function public.mark_proof_files_deleted(p_ids uuid[]) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_n int;
begin
  perform private.require_admin_or_service();
  with marked as (
    update public.review_proofs pr
    set file_deleted_at = now()
    where pr.id = any(coalesce(p_ids, '{}'))
      and pr.checked_at is not null and pr.checked_at <= private.proof_retention_cutoff() and pr.file_deleted_at is null
    returning pr.id
  ), logged as (
    insert into public.audit_log (actor_id, action, target_type, target_id, reason)
    select auth.uid(), 'delete_proof_file', 'proof', id::text, 'Retention period after the check has passed' from marked
    returning 1
  )
  select count(*) into v_n from logged;
  return v_n;
end;
$$;

revoke execute on function public.proof_files_due(int) from public, anon;
revoke execute on function public.mark_proof_files_deleted(uuid[]) from public, anon;
grant execute on function public.proof_files_due(int) to authenticated, service_role;
grant execute on function public.mark_proof_files_deleted(uuid[]) to authenticated, service_role;
