-- Phone accounts (Plan 2, Task 3): profile columns, the OTP gate and its limits, a guard on auth.users
-- so the gate cannot be bypassed with the public anon key, onboarding, and linking providers to the
-- account that signs in with the number on their listing.
-- Re-runnable: if not exists / create or replace / drop ... if exists.

-- ---------------------------------------------------------------- profiles
alter table public.profiles add column if not exists line_type text;
alter table public.profiles add column if not exists line_type_checked_at timestamptz;
alter table public.profiles add column if not exists group_member_at timestamptz;
alter table public.profiles add column if not exists deleted_at timestamptz;

-- "Sarah K.": first name (letters, spaces, hyphens, apostrophes; up to 30) then a surname initial.
alter table public.profiles drop constraint if exists profiles_display_name_format;
alter table public.profiles add constraint profiles_display_name_format
  check (display_name is null or display_name ~ '^[[:alpha:]][[:alpha:] ''-]{0,29} [[:alpha:]]\.$');
alter table public.profiles drop constraint if exists profiles_district_format;
alter table public.profiles add constraint profiles_district_format
  check (postcode_district is null or postcode_district ~ '^([A-Z]{1,2}[0-9]{1,2}|OTHER)$');

-- ---------------------------------------------------------------- otp_requests
-- One row per sign-in code request, whatever happened to it. Kept 30 days (purged by otp_gate).
create table if not exists public.otp_requests (
  id bigint generated always as identity primary key,
  phone_e164 text not null check (phone_e164 ~ '^\+447[1-9][0-9]{8}$'),
  ip_hash text not null,
  outcome text not null default 'pending' check (outcome in
    ('pending', 'limited_number', 'limited_ip', 'cap_reached', 'approved', 'voip', 'not_mobile', 'lookup_failed', 'sent', 'send_failed')),
  line_type text,
  created_at timestamptz not null default now()
);
create index if not exists otp_requests_phone_idx on public.otp_requests (phone_e164, created_at);
create index if not exists otp_requests_ip_idx on public.otp_requests (ip_hash, created_at);
create index if not exists otp_requests_created_idx on public.otp_requests (created_at);
alter table public.otp_requests enable row level security;
revoke all on public.otp_requests from public, anon, authenticated;

-- ---------------------------------------------------------------- settings
insert into public.settings (key, value) values
  ('sms_monthly_cap_gbp', '20'::jsonb),
  ('sms_cost_per_send_gbp', '0.10'::jsonb),
  ('admin_emails', '[]'::jsonb),
  ('otp_limits', '{"number_15m":3,"number_24h":6,"ip_1h":10,"ip_24h":20}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- otp_gate / otp_record (service role only)
-- Called by the sign-in server action before any Lookup or SMS. Records the request and says whether to go on.
create or replace function public.otp_gate(p_phone text, p_ip_hash text)
returns table (request_id bigint, verdict text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_limits jsonb;
  v_cap numeric;
  v_cost numeric;
  v_month_start timestamptz;
  v_n15 int;
  v_n24 int;
  v_i1 int;
  v_i24 int;
  v_sent int;
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

  select count(*) filter (where created_at > now() - interval '15 minutes'),
         count(*) filter (where created_at > now() - interval '24 hours')
    into v_n15, v_n24
  from public.otp_requests where phone_e164 = p_phone;
  select count(*) filter (where created_at > now() - interval '1 hour'),
         count(*) filter (where created_at > now() - interval '24 hours')
    into v_i1, v_i24
  from public.otp_requests where ip_hash = p_ip_hash;

  -- This calendar month in Bolton.
  v_month_start := date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London';
  select count(*) into v_sent from public.otp_requests where outcome = 'sent' and created_at >= v_month_start;

  if v_n15 >= coalesce((v_limits ->> 'number_15m')::int, 3) or v_n24 >= coalesce((v_limits ->> 'number_24h')::int, 6) then
    v_outcome := 'limited_number';
    v_verdict := 'number_limited';
  elsif v_i1 >= coalesce((v_limits ->> 'ip_1h')::int, 10) or v_i24 >= coalesce((v_limits ->> 'ip_24h')::int, 20) then
    v_outcome := 'limited_ip';
    v_verdict := 'ip_limited';
  elsif v_sent * coalesce(v_cost, 0.10) >= coalesce(v_cap, 20) then
    v_outcome := 'cap_reached';
    v_verdict := 'cap_reached';
  end if;

  insert into public.otp_requests (phone_e164, ip_hash, outcome) values (p_phone, p_ip_hash, v_outcome)
  returning id into v_id;
  return query select v_id, v_verdict;
end;
$$;

create or replace function public.otp_record(p_request_id bigint, p_outcome text, p_line_type text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.otp_requests
  set outcome = p_outcome, line_type = coalesce(p_line_type, line_type)
  where id = p_request_id;
end;
$$;

revoke execute on function public.otp_gate(text, text) from public, anon, authenticated;
revoke execute on function public.otp_record(bigint, text, text) from public, anon, authenticated;
grant execute on function public.otp_gate(text, text) to service_role;
grant execute on function public.otp_record(bigint, text, text) to service_role;

-- ---------------------------------------------------------------- auth.users guard
-- Supabase's "allow sign-ups" switch is all-or-nothing, so the rules live here:
--   * a phone account needs an approved (or sent) otp_requests row for that number in the last 15 minutes,
--     and the number must not already belong to another live account;
--   * an email-only account is refused unless the email is in settings.admin_emails;
--   * soft deletes (deleted_at set, phone obfuscated) and bare-id fixture rows pass.
create or replace function private.guard_auth_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_e164 text;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if coalesce(new.phone, '') <> '' then
    if tg_op = 'UPDATE' and new.phone is not distinct from old.phone then
      return new;
    end if;
    v_e164 := '+' || ltrim(new.phone, '+');
    if not exists (
      select 1 from public.otp_requests r
      where r.phone_e164 = v_e164 and r.outcome in ('approved', 'sent') and r.created_at > now() - interval '15 minutes'
    ) then
      raise exception 'phone sign-up not approved' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from auth.users u
      where u.id <> new.id and u.deleted_at is null and ltrim(u.phone, '+') = ltrim(new.phone, '+')
    ) then
      raise exception 'phone already registered' using errcode = 'unique_violation';
    end if;
  elsif tg_op = 'INSERT' and coalesce(new.email, '') <> '' then
    if not exists (
      select 1 from public.settings s, jsonb_array_elements_text(s.value) e
      where s.key = 'admin_emails' and jsonb_typeof(s.value) = 'array' and lower(e) = lower(new.email)
    ) then
      raise exception 'email sign-ups are disabled' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_auth_user() from public, anon, authenticated;

drop trigger if exists bv_guard_auth_user_insert on auth.users;
create trigger bv_guard_auth_user_insert
  before insert on auth.users
  for each row execute function private.guard_auth_user();
drop trigger if exists bv_guard_auth_user_phone on auth.users;
create trigger bv_guard_auth_user_phone
  before update of phone on auth.users
  for each row execute function private.guard_auth_user();

-- ---------------------------------------------------------------- account functions (authenticated)
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
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.user_id = auth.uid();
$$;

-- Links every consented/live/paused listing whose phone or WhatsApp number is the caller's phone.
create or replace function public.claim_provider_listings() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_n int;
begin
  if v_uid is null or not exists (select 1 from public.profiles where user_id = v_uid and deleted_at is null) then
    return 0;
  end if;
  select phone into v_phone from auth.users where id = v_uid and deleted_at is null;
  if coalesce(v_phone, '') = '' then
    return 0;
  end if;
  v_phone := '+' || ltrim(v_phone, '+');

  with linked as (
    update public.providers
    set user_id = v_uid
    where user_id is null
      and status in ('consented', 'live', 'paused')
      and (phone_e164 = v_phone or whatsapp_e164 = v_phone)
    returning id
  ), logged as (
    insert into public.audit_log (actor_id, action, target_type, target_id)
    select v_uid, 'claim_provider', 'provider', id::text from linked
    returning 1
  )
  select count(*) into v_n from logged;

  if v_n > 0 then
    update public.profiles set role = 'provider' where user_id = v_uid and role = 'resident';
  end if;
  return v_n;
end;
$$;

create or replace function public.complete_onboarding(p_display_name text, p_district text, p_group_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_code text;
  v_member timestamptz;
  v_line_type text;
  v_checked_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if nullif(btrim(p_group_code), '') is not null then
    select s.value #>> '{}' into v_code from public.settings s where s.key = 'group_code';
    if v_code is null or lower(btrim(p_group_code)) <> lower(btrim(v_code)) then
      raise exception 'bad_group_code';
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

create or replace function public.set_group_code(p_code text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
begin
  select s.value #>> '{}' into v_code from public.settings s where s.key = 'group_code';
  if v_code is null or nullif(btrim(p_code), '') is null or lower(btrim(p_code)) <> lower(btrim(v_code)) then
    return false;
  end if;
  update public.profiles
  set group_member_at = coalesce(group_member_at, now())
  where user_id = auth.uid() and deleted_at is null;
  return found;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.my_account()',
    'public.claim_provider_listings()',
    'public.complete_onboarding(text, text, text)',
    'public.set_group_code(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- unlink on number change
-- A listing stays linked only while one of its numbers is the linked account's phone.
create or replace function private.unlink_on_number_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_phone text;
begin
  if new.user_id is null then
    return new;
  end if;
  select '+' || ltrim(u.phone, '+') into v_phone from auth.users u where u.id = new.user_id;
  if v_phone is null or v_phone is distinct from new.phone_e164 and v_phone is distinct from new.whatsapp_e164 then
    new.user_id := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.unlink_on_number_change() from public, anon, authenticated;

drop trigger if exists providers_unlink_on_number_change on public.providers;
create trigger providers_unlink_on_number_change
  before update of phone_e164, whatsapp_e164 on public.providers
  for each row execute function private.unlink_on_number_change();
