-- Plan 2b Task 3: email-code and Google accounts behind the auth.users guard.
--
-- Phone sign-in is switched off (SIGN_IN_PHONE); people sign in with Google or a 6-digit email code.
--   * email_requests + email_gate / email_approve / email_record: the database half of "Email me a code",
--     mirroring otp_gate. The gate checks, in order, recording the first hit as the row's outcome:
--     invalid · admin_address · blocked_domain · address_taken (a live account holds another form of the
--     same normalised address) · per-address limits · per-IP limits · the Resend free-tier caps (sent rows
--     this London day / month). email_approve binds an ok request to the app's single-use nonce (sha256 only).
--   * private.code_verify_gate: the wrong-code limiter shared by phone (subject = E.164) and email
--     (subject = 'email:' || normalised address); one connection's wrong codes count across both.
--     otp_verify_gate and the new email_verify_gate are thin wrappers.
--   * private.sign_in_kind: admin / google / phone / email / null.
--   * private.guard_auth_user (new body, triggers untouched): a new email account needs the nonce of an
--     approved, unused request for its normalised address from the last 15 minutes, arrives unconfirmed,
--     on an allowed domain, with an address nobody else holds; a Google account is accepted unless its
--     normalised email is taken; an abandoned email account (code asked for, never used, over 15 minutes
--     old) holds nothing and is removed when a new account for its normalised address arrives; anything else with an email (a password sign-up, say) is refused;
--     admin allow-list and phone path unchanged.
--   * private.scrub_auth_user (new body): no usable password on any non-admin account; email changes
--     refused for non-admins; the nonce never stays in the metadata.
--   * my_account adds sign_in_kind and email.
-- No new triggers on auth.users (production postgres may not own it). Re-runnable.

-- ---------------------------------------------------------------- settings
insert into public.settings (key, value) values
  ('email_limits', '{"address_15m":3,"address_24h":6,"ip_1h":10,"ip_24h":20,"daily_cap":90,"monthly_cap":2900}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- admin addresses
create or replace function private.is_admin_email(p_email text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(p_email, '') <> '' and exists (
    select 1 from public.settings s, jsonb_array_elements_text(s.value) e
    where s.key = 'admin_emails' and jsonb_typeof(s.value) = 'array' and lower(e) = lower(btrim(p_email))
  );
$$;
revoke execute on function private.is_admin_email(text) from public, anon, authenticated;

-- An "abandoned" email account: someone asked for a code but never used it. Unconfirmed, never signed in, no
-- phone, no identity but its email one, no profile, not an admin, and older than the 15-minute code expiry
-- (so its code can no longer work). It must not lock its mailbox out of a later sign-in (a Google account or
-- an email code for a dot/+tag variant of the same address): it doesn't count as holding its address, and
-- the guard removes it when a new account for that normalised address arrives.
create or replace function private.abandoned_email_account(p_uid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_uid
      and u.deleted_at is null
      and coalesce(u.email, '') <> '' and u.email_confirmed_at is null
      and coalesce(u.phone, '') = '' and u.phone_confirmed_at is null
      and u.last_sign_in_at is null
      and u.created_at < now() - interval '15 minutes'
      and not private.is_admin_email(u.email)
      and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider <> 'email')
      and not exists (select 1 from public.profiles p where p.user_id = u.id)
  );
$$;
revoke execute on function private.abandoned_email_account(uuid) from public, anon, authenticated;

-- A live account (other than p_except) whose email normalises to p_norm. Abandoned accounts don't count.
create or replace function private.email_norm_taken(p_norm text, p_except uuid default null) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_norm is not null and exists (
    select 1 from auth.users u
    where u.deleted_at is null
      and (p_except is null or u.id <> p_except)
      and coalesce(u.email, '') <> ''
      and private.normalise_email(u.email) = p_norm
      and not private.abandoned_email_account(u.id)
  );
$$;
revoke execute on function private.email_norm_taken(text, uuid) from public, anon, authenticated;

-- Removes abandoned accounts (other than p_except) for a normalised address, when a new account for it arrives.
-- Their identities and sessions go with them (auth's own cascades); they have no profile, so nothing else does.
create or replace function private.drop_abandoned_email_accounts(p_norm text, p_except uuid) returns void
language sql security definer set search_path = ''
as $$
  delete from auth.users u
  where p_norm is not null
    and u.deleted_at is null
    and (p_except is null or u.id <> p_except)
    and coalesce(u.email, '') <> ''
    and private.normalise_email(u.email) = p_norm
    and private.abandoned_email_account(u.id);
$$;
revoke execute on function private.drop_abandoned_email_accounts(text, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- email_requests
-- One row per "Email me a code", whatever happened to it. Kept 35 days (purged by email_gate).
create table if not exists public.email_requests (
  id bigint generated always as identity primary key,
  email_norm text not null,
  ip_hash text not null,
  outcome text not null default 'pending' check (outcome in
    ('pending', 'invalid', 'limited_address', 'limited_ip', 'cap_reached', 'blocked_domain', 'address_taken',
     'admin_address', 'approved', 'sent', 'send_failed')),
  nonce_hash text,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_requests_email_idx on public.email_requests (email_norm, created_at);
create index if not exists email_requests_ip_idx on public.email_requests (ip_hash, created_at);
create index if not exists email_requests_created_idx on public.email_requests (created_at);
create unique index if not exists email_requests_nonce_idx on public.email_requests (nonce_hash) where nonce_hash is not null;
alter table public.email_requests enable row level security;
revoke all on public.email_requests from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- email_gate (service role only)
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
  perform pg_advisory_xact_lock(hashtext('email_gate:' || coalesce(v_norm, '')));
  delete from public.email_requests where created_at < now() - interval '35 days';

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
  elsif v_day >= coalesce((v_limits ->> 'daily_cap')::int, 90) or v_month >= coalesce((v_limits ->> 'monthly_cap')::int, 2900) then
    v_outcome := 'cap_reached';
    v_verdict := 'cap_reached';
  end if;

  insert into public.email_requests (email_norm, ip_hash, outcome) values (coalesce(v_norm, ''), v_ip, v_outcome)
  returning id into v_id;
  return query select v_id, v_verdict;
end;
$$;

-- Marks a pending request approved and binds it to the caller's nonce (only its sha256 is stored).
create or replace function public.email_approve(p_request_id bigint, p_nonce_hash text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_nonce_hash is null or p_nonce_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad nonce hash' using errcode = '22023';
  end if;
  update public.email_requests set outcome = 'approved', nonce_hash = p_nonce_hash
  where id = p_request_id and outcome = 'pending';
  if not found then
    raise exception 'request not pending' using errcode = '22023';
  end if;
end;
$$;

-- Records what happened to the send. Cannot approve (that needs a nonce: email_approve).
create or replace function public.email_record(p_request_id bigint, p_outcome text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_outcome = 'approved' then
    raise exception 'approve with email_approve' using errcode = '22023';
  end if;
  update public.email_requests set outcome = p_outcome where id = p_request_id;
end;
$$;

revoke execute on function public.email_gate(text, text) from public, anon, authenticated;
revoke execute on function public.email_approve(bigint, text) from public, anon, authenticated;
revoke execute on function public.email_record(bigint, text) from public, anon, authenticated;
grant execute on function public.email_gate(text, text) to service_role;
grant execute on function public.email_approve(bigint, text) to service_role;
grant execute on function public.email_record(bigint, text) to service_role;

-- ---------------------------------------------------------------- wrong-code limiter (phone and email)
-- The body of 000015's otp_verify_gate, keyed by a subject: the E.164 number for phone, 'email:' || the
-- normalised address for email. Rows still live in otp_verify_attempts (phone_e164 holds the subject), so
-- one connection's wrong codes count across both. Task 7 re-creates this to purge identity_retention too.
create or replace function private.code_verify_gate(p_subject text, p_ip_hash text)
returns table (attempt_id bigint, verdict text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_limits jsonb;
  v_n int;
  v_i int;
  v_verdict text := 'ok';
  v_id bigint;
begin
  -- Subject lock first, then IP, always in that order (no deadlocks between concurrent checks).
  perform pg_advisory_xact_lock(hashtext('otp_verify:phone:' || coalesce(p_subject, '')));
  perform pg_advisory_xact_lock(hashtext('otp_verify:ip:' || coalesce(p_ip_hash, '')));
  delete from public.otp_verify_attempts where created_at < now() - interval '1 day';
  -- Deleted people's numbers go after 12 months (final review 2, M4), on every code check.
  delete from public.phone_retention where purge_after < now();

  select value into v_limits from public.settings where key = 'otp_verify_limits';
  v_limits := coalesce(v_limits, '{}'::jsonb);

  select count(*) into v_n from public.otp_verify_attempts
  where phone_e164 = p_subject and outcome in ('pending', 'wrong') and created_at > now() - interval '15 minutes';
  select count(*) into v_i from public.otp_verify_attempts
  where ip_hash = p_ip_hash and outcome in ('pending', 'wrong') and created_at > now() - interval '1 hour';

  if v_n >= coalesce((v_limits ->> 'number_15m')::int, 5) then
    v_verdict := 'subject_locked';
  elsif v_i >= coalesce((v_limits ->> 'ip_1h')::int, 20) then
    v_verdict := 'ip_locked';
  end if;

  insert into public.otp_verify_attempts (phone_e164, ip_hash, outcome)
  values (coalesce(p_subject, ''), coalesce(p_ip_hash, ''), case when v_verdict = 'ok' then 'pending' else 'locked' end)
  returning id into v_id;
  return query select v_id, v_verdict;
end;
$$;
revoke execute on function private.code_verify_gate(text, text) from public, anon, authenticated;

create or replace function public.otp_verify_gate(p_phone text, p_ip_hash text)
returns table (attempt_id bigint, verdict text)
language sql security definer set search_path = ''
as $$
  select g.attempt_id, case when g.verdict = 'subject_locked' then 'number_locked' else g.verdict end
  from private.code_verify_gate(p_phone, p_ip_hash) g;
$$;
revoke execute on function public.otp_verify_gate(text, text) from public, anon, authenticated;
grant execute on function public.otp_verify_gate(text, text) to service_role;

create or replace function public.email_verify_gate(p_email text, p_ip_hash text)
returns table (attempt_id bigint, verdict text)
language sql security definer set search_path = ''
as $$
  select g.attempt_id, case when g.verdict = 'subject_locked' then 'address_locked' else g.verdict end
  from private.code_verify_gate(
    'email:' || coalesce(private.normalise_email(p_email), lower(btrim(coalesce(p_email, '')))), p_ip_hash) g;
$$;
revoke execute on function public.email_verify_gate(text, text) from public, anon, authenticated;
grant execute on function public.email_verify_gate(text, text) to service_role;

-- ---------------------------------------------------------------- sign_in_kind
-- How an account signs in: 'admin' (email on the allow-list), else 'google' (has a Google identity), else
-- 'phone' (confirmed phone), else 'email' (confirmed email, i.e. an email code), else null (unconfirmed,
-- anonymous or unknown). Decides who may review (Task 7) and whose reviews are held (Task 8).
create or replace function private.sign_in_kind(p_uid uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when private.is_admin_email(u.email) then 'admin'
    when coalesce(u.is_anonymous, false) then null
    when exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google') then 'google'
    when coalesce(u.phone, '') <> '' and u.phone_confirmed_at is not null then 'phone'
    when coalesce(u.email, '') <> '' and u.email_confirmed_at is not null then 'email'
  end
  from auth.users u
  where u.id = p_uid;
$$;
revoke execute on function private.sign_in_kind(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- auth.users guard (insert / phone change)
create or replace function private.guard_auth_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_e164 text;
  v_nonce text;
  v_request bigint;
  v_norm text;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Only fired for UPDATE OF phone. Keeping the same number is fine; anything else is refused.
    if new.phone is not distinct from old.phone or coalesce(new.phone, '') = coalesce(old.phone, '') then
      return new;
    end if;
    raise exception 'phone changes are not supported' using errcode = 'check_violation';
  end if;

  v_nonce := nullif(new.raw_user_meta_data ->> 'bv_nonce', '');

  if coalesce(new.phone, '') <> '' then
    -- Phone (000011, unchanged).
    v_e164 := '+' || ltrim(new.phone, '+');
    if v_nonce is not null then
      select r.id into v_request
      from public.otp_requests r
      where r.phone_e164 = v_e164
        and r.outcome = 'approved'
        and r.consumed_at is null
        and r.nonce_hash = encode(sha256(convert_to(v_nonce, 'UTF8')), 'hex')
        and r.created_at > now() - interval '15 minutes'
      for update;
    end if;
    if v_request is null then
      raise exception 'phone sign-up not approved' using errcode = 'check_violation';
    end if;
    if new.phone_confirmed_at is not null then
      raise exception 'phone sign-up must be confirmed by code' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from auth.users u
      where u.id <> new.id and u.deleted_at is null and ltrim(u.phone, '+') = ltrim(new.phone, '+')
    ) then
      raise exception 'phone already registered' using errcode = 'unique_violation';
    end if;

    update public.otp_requests set consumed_at = now() where id = v_request;
    new.raw_user_meta_data := new.raw_user_meta_data - 'bv_nonce';
    if coalesce(new.email, '') = '' then
      new.encrypted_password := private.random_password_hash();
    end if;

  elsif coalesce(new.email, '') <> '' then
    if private.is_admin_email(new.email) then
      -- The admin (email + password at /admin), unchanged.
      return new;
    end if;
    v_norm := private.normalise_email(new.email);

    if coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google' then
      -- Continue with Google: Google vets its own accounts; one account per normalised address.
      if private.email_norm_taken(v_norm, new.id) then
        raise exception 'email already registered' using errcode = 'unique_violation';
      end if;
      perform private.drop_abandoned_email_accounts(v_norm, new.id);
      new.encrypted_password := private.random_password_hash();
      return new;
    end if;

    -- Anything else with an email (an email code, or a password sign-up) needs the app's nonce.
    if v_nonce is not null and v_norm is not null then
      select r.id into v_request
      from public.email_requests r
      where r.email_norm = v_norm
        and r.outcome = 'approved'
        and r.consumed_at is null
        and r.nonce_hash = encode(sha256(convert_to(v_nonce, 'UTF8')), 'hex')
        and r.created_at > now() - interval '15 minutes'
      for update;
    end if;
    if v_request is null then
      raise exception 'email sign-up not approved' using errcode = 'check_violation';
    end if;
    if new.email_confirmed_at is not null then
      raise exception 'email sign-up must be confirmed by code' using errcode = 'check_violation';
    end if;
    if private.email_domain_blocked(new.email) then
      raise exception 'email domain not allowed' using errcode = 'check_violation';
    end if;
    if private.email_norm_taken(v_norm, new.id) then
      raise exception 'email already registered' using errcode = 'unique_violation';
    end if;

    update public.email_requests set consumed_at = now() where id = v_request;
    perform private.drop_abandoned_email_accounts(v_norm, new.id);
    new.raw_user_meta_data := new.raw_user_meta_data - 'bv_nonce';
    new.encrypted_password := private.random_password_hash();
  end if;
  -- Neither phone nor email: bare-id test fixtures.
  return new;
end;
$$;
revoke execute on function private.guard_auth_user() from public, anon, authenticated;

-- ---------------------------------------------------------------- auth.users scrub (every update)
-- Nobody but the admin signs in with a password: any password change on a live non-admin account (and a
-- phone-only account's phone confirmation, as before) is replaced with a random bcrypt hash. Email changes
-- are refused for non-admins (a user-initiated change sets email_change). The nonce never stays.
create or replace function private.scrub_auth_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin boolean;
begin
  if new.raw_user_meta_data ? 'bv_nonce' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'bv_nonce';
  end if;
  if new.deleted_at is not null then
    return new;
  end if;
  -- Same answer as private.sign_in_kind(new.id) = 'admin', from the row being written.
  v_admin := private.is_admin_email(new.email);
  if not v_admin and (
       new.encrypted_password is distinct from old.encrypted_password
       or (coalesce(new.phone, '') <> '' and coalesce(new.email, '') = ''
           and old.phone_confirmed_at is null and new.phone_confirmed_at is not null)
     ) then
    new.encrypted_password := private.random_password_hash();
  end if;
  if not v_admin and coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change then
    raise exception 'email changes are not supported' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function private.scrub_auth_user() from public, anon, authenticated;

-- ---------------------------------------------------------------- my_account (+ sign_in_kind, email)
create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p.user_id,
    'display_name', p.display_name,
    'postcode_district', p.postcode_district,
    'group_member', p.group_member_at is not null,
    'role', p.role,
    'deleted', p.deleted_at is not null,
    'created_at', p.created_at,
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'slug', v.slug, 'business_name', v.business_name, 'status', v.status)
                       order by v.business_name)
      from public.providers v where v.user_id = p.user_id
    ), '[]'::jsonb),
    'sign_in_kind', private.sign_in_kind(p.user_id),
    'email', (select nullif(u.email, '') from auth.users u where u.id = p.user_id)
  )
  from public.profiles p
  where p.user_id = auth.uid();
$$;
