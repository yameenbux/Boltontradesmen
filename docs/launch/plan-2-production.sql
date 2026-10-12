-- Bolton Vouched: Plan 2 database changes for the LIVE Supabase project (mmarznvndvbwyhhtbfjy).
-- Paste ALL of this into Supabase -> SQL Editor -> New query -> Run. It runs as one transaction:
-- if anything fails, nothing is changed. Confirm the 'destructive operation' warning (it is the
-- 'drop ... if exists' lines that rebuild functions; no data is deleted).
-- Generated from supabase/migrations/20261012000002 .. 20261012000017.
begin;

-- ==================================================================== 20261012000002_plan1_followups.sql
-- Plan 1 "fix early" follow-ups (docs/superpowers/plans/plan-1-followups.md):
--   * a removed provider can only come back through a fresh invite (and consent);
--   * consent tokens expire 14 days after they are created or rotated;
--   * reviews are never hard-deleted, and a removal needs a non-blank reason;
--   * a whatsapp_tap is not logged for a provider with no WhatsApp number.
-- Re-runnable: create or replace, drop ... if exists.

-- ---------------------------------------------------------------- consent token expiry
-- Existing rows (tokens already sent) get 14 days from the migration (spec ruling 22).
alter table public.providers
  add column if not exists consent_token_expires_at timestamptz not null default now() + interval '14 days';

-- ---------------------------------------------------------------- removed is final
create or replace function private.enforce_removed_exit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'removed' and new.status is distinct from old.status and new.status <> 'invited' then
    raise exception 'a removed provider can only return through a new invite' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function private.enforce_removed_exit() from public, anon, authenticated;

drop trigger if exists providers_removed_is_final on public.providers;
create trigger providers_removed_is_final
  before update of status on public.providers
  for each row execute function private.enforce_removed_exit();

-- ---- admin_reinvite_provider: removed -> invited with a fresh consent token. Returns the token.
create or replace function public.admin_reinvite_provider(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.provider_status;
  v_token uuid;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'a reason is required to re-invite a provider' using errcode = 'check_violation';
  end if;
  select status into v_status from public.providers where id = p_id for update;
  if not found then
    raise exception 'provider not found' using errcode = 'P0002';
  end if;
  if v_status <> 'removed' then
    raise exception 'only a removed provider can be re-invited' using errcode = 'check_violation';
  end if;
  update public.providers
  set status = 'invited',
      consent_at = null,
      consent_evidence = null,
      user_id = null,
      consent_token = gen_random_uuid(),
      consent_token_used_at = null,
      consent_token_expires_at = now() + interval '14 days'
  where id = p_id
  returning consent_token into v_token;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'reinvite_provider', 'provider', p_id::text, btrim(p_reason));
  return v_token;
end;
$$;

-- ---- admin_new_consent_token: rotation also restarts the 14-day expiry.
create or replace function public.admin_new_consent_token(p_provider uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_token uuid;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  update public.providers
  set consent_token = gen_random_uuid(),
      consent_token_used_at = null,
      consent_token_expires_at = now() + interval '14 days'
  where id = p_provider and status = 'invited'
  returning consent_token into v_token;
  if v_token is null then
    if exists (select 1 from public.providers where id = p_provider) then
      raise exception 'consent links can only be created for invited providers' using errcode = 'check_violation';
    end if;
    raise exception 'provider not found' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (auth.uid(), 'new_consent_token', 'provider', p_provider::text);
  return v_token;
end;
$$;

-- ---- admin_get_provider: adds consent_token_expires_at.
create or replace function public.admin_get_provider(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'business_name', p.business_name, 'contact_name', p.contact_name,
    'phone_e164', p.phone_e164, 'whatsapp_e164', p.whatsapp_e164, 'areas', p.areas, 'bio', p.bio,
    'status', p.status, 'consent_at', p.consent_at, 'consent_token_expires_at', p.consent_token_expires_at,
    'category_ids', coalesce((select jsonb_agg(pc.category_id) from public.provider_categories pc where pc.provider_id = p.id), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('id', ck.id, 'kind', ck.kind, 'reference', ck.reference,
                'expires_on', ck.expires_on, 'checked_at', ck.checked_at) order by ck.checked_at desc)
              from public.provider_checks ck where ck.provider_id = p.id), '[]'::jsonb)
  ) into v
  from public.providers p where p.id = p_id;
  return v;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_reinvite_provider(uuid, text)',
    'public.admin_new_consent_token(uuid)',
    'public.admin_get_provider(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---- consent flow: same signatures as migrations 000006 / 000005, plus the expiry check.
create or replace function public.consent_preview(p_token uuid)
returns table (business_name text, categories text[], areas text[], contact_name text, has_whatsapp boolean)
language sql stable security definer set search_path = ''
as $$
  select p.business_name,
         coalesce((select array_agg(c.name order by c.name) from public.provider_categories pc
                   join public.categories c on c.id = pc.category_id where pc.provider_id = p.id), '{}'::text[]),
         coalesce(p.areas, '{}'::text[]),
         p.contact_name,
         (p.whatsapp_e164 is not null)
  from public.providers p
  where p.consent_token = p_token and p.consent_token_used_at is null and p.status = 'invited'
    and p.consent_token_expires_at > now();
$$;

create or replace function public.accept_consent(
  p_token uuid, p_ip text, p_text_version text, p_text_sha256 text, p_owner_legal_name text, p_contact_email text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.providers
  set status = 'consented',
      consent_at = now(),
      consent_token_used_at = now(),
      consent_evidence = jsonb_build_object('ip', p_ip, 'text_version', p_text_version, 'text_sha256', p_text_sha256,
        'owner_legal_name', p_owner_legal_name, 'contact_email', p_contact_email, 'accepted_at', now())
  where consent_token = p_token and consent_token_used_at is null and status = 'invited'
    and consent_token_expires_at > now()
  returning id into v_id;
  if v_id is null then
    return 'invalid';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (null, 'accept_consent', 'provider', v_id::text);
  return 'ok';
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.consent_preview(uuid)', 'public.accept_consent(uuid, text, text, text, text, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- reviews
alter table public.reviews drop constraint if exists reviews_removed_requires_reason;
alter table public.reviews add constraint reviews_removed_requires_reason
  check (status <> 'removed' or nullif(btrim(removal_reason), '') is not null);

create or replace function private.forbid_review_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  raise exception 'reviews are never deleted' using errcode = 'restrict_violation';
end;
$$;
revoke execute on function private.forbid_review_delete() from public, anon, authenticated;

drop trigger if exists reviews_never_deleted on public.reviews;
create trigger reviews_never_deleted
  before delete on public.reviews
  for each row execute function private.forbid_review_delete();

-- ---------------------------------------------------------------- contact logging
-- A whatsapp_tap for a provider with no WhatsApp inserts nothing (the route 404s), but still returns the row.
create or replace function public.log_contact(
  p_slug text, p_type public.contact_type, p_actor uuid, p_device_hash text
) returns table (phone_e164 text, whatsapp_e164 text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_phone text;
  v_wa text;
begin
  select p.id, p.phone_e164, p.whatsapp_e164 into v_id, v_phone, v_wa
  from public.providers p
  where p.slug = p_slug and p.status = 'live';

  if v_id is null then
    return;
  end if;

  if not (p_type = 'whatsapp_tap' and v_wa is null) then
    insert into public.contact_events (provider_id, type, actor_id, device_hash)
    values (v_id, p_type, p_actor, p_device_hash);
  end if;

  return query select v_phone, v_wa;
end;
$$;
revoke execute on function public.log_contact(text, public.contact_type, uuid, text) from public, anon, authenticated;
grant execute on function public.log_contact(text, public.contact_type, uuid, text) to service_role;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000002', 'plan1_followups') on conflict do nothing;

-- ==================================================================== 20261012000003_phone_accounts.sql
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

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000003', 'phone_accounts') on conflict do nothing;

-- ==================================================================== 20261012000004_review_posting.sql
-- Review posting (Plan 2, Task 6): proof, reply and flag tables (closed to browsers), and the functions
-- that are the only way to write a review. Every anti-fake posting rule lives here, so no path around the
-- app can skip them. Re-runnable: if not exists / create or replace.

-- ---------------------------------------------------------------- tables
create table if not exists public.review_proofs (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  outcome text not null default 'pending' check (outcome in ('pending', 'accepted', 'rejected')),
  note text,
  checked_at timestamptz,
  checked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists one_active_proof_per_review on public.review_proofs (review_id)
  where outcome in ('pending', 'accepted');

create table if not exists public.review_responses (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews (id) on delete restrict,
  provider_id uuid not null references public.providers (id) on delete restrict,
  author_id uuid not null references auth.users (id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 400),
  status text not null default 'published' check (status in ('published', 'removed')),
  removal_reason text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint review_responses_removed_requires_reason
    check (status <> 'removed' or nullif(btrim(removal_reason), '') is not null)
);

create table if not exists public.flags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('review', 'reply')),
  target_id uuid not null,
  source text not null check (source in ('auto', 'user')),
  rule text not null,
  note text,
  reporter_id uuid references auth.users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists flags_auto_once on public.flags (target_type, target_id, rule) where source = 'auto';
create unique index if not exists flags_one_open_report on public.flags (target_type, target_id, reporter_id)
  where source = 'user' and status = 'open';
create index if not exists flags_open_idx on public.flags (status, created_at);
create index if not exists review_proofs_review_idx on public.review_proofs (review_id);

alter table public.review_proofs enable row level security;
alter table public.review_responses enable row level security;
alter table public.flags enable row level security;
revoke all on public.review_proofs, public.review_responses, public.flags from public, anon, authenticated;

-- ---------------------------------------------------------------- auto-flag rules (stub; Task 7 replaces it)
create or replace function private.run_review_flags(p_review uuid) returns text[]
language plpgsql security definer set search_path = ''
as $$
begin
  return '{}'::text[];
end;
$$;
revoke execute on function private.run_review_flags(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- shared checks
-- Why the caller may not post a new review of this provider, or null. Covers the person and the
-- relationship (not the answers).
create or replace function private.review_block_reason(p_uid uuid, p_provider uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_created timestamptz;
begin
  select * into v_profile from public.profiles where user_id = p_uid;
  if v_profile.user_id is null or v_profile.deleted_at is not null or v_profile.display_name is null then
    return 'not_member';
  end if;
  if v_profile.blocked_at is not null then
    return 'blocked';
  end if;
  if not exists (select 1 from public.providers where id = p_provider and status = 'live') then
    return 'provider_not_found';
  end if;
  if exists (select 1 from public.providers where id = p_provider and user_id = p_uid) then
    return 'own_listing';
  end if;
  if exists (
    select 1
    from public.providers mine
    join public.provider_categories mc on mc.provider_id = mine.id
    join public.provider_categories tc on tc.category_id = mc.category_id and tc.provider_id = p_provider
    where mine.user_id = p_uid and mine.status <> 'removed'
  ) then
    return 'shares_category';
  end if;
  if exists (
    select 1 from public.reviews
    where provider_id = p_provider and reviewer_id = p_uid and status = 'removed'
      and removal_reason is distinct from 'Reviewer deleted their account'
  ) then
    return 'removed_before';
  end if;
  select created_at into v_created from auth.users where id = p_uid;
  if v_created > now() - interval '24 hours'
     and exists (select 1 from public.reviews where reviewer_id = p_uid) then
    return 'new_account_limit';
  end if;
  return null;
end;
$$;
revoke execute on function private.review_block_reason(uuid, uuid) from public, anon, authenticated;

-- Validates and normalises the answers for (provider, category). Raises the error code on failure.
create or replace function private.review_fields(p_provider uuid, p jsonb)
returns table (
  category_id uuid, job_month date, value_band public.value_band, on_time public.on_time_answer,
  on_price public.on_price_answer, quality smallint, tidy boolean, use_again public.use_again_answer, comment text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cat uuid;
  v_asks_tidy boolean;
  v_month date;
  v_this_month date := date_trunc('month', now() at time zone 'Europe/London')::date;
  v_comment text;
begin
  begin
    v_cat := (p ->> 'category_id')::uuid;
  exception when others then
    raise exception 'bad_category';
  end;
  select g.asks_tidy into v_asks_tidy
  from public.categories c join public.category_groups g on g.id = c.group_id
  where c.id = v_cat and c.active
    and exists (select 1 from public.provider_categories pc where pc.provider_id = p_provider and pc.category_id = v_cat)
    and public.category_visible(p_provider, v_cat);
  if v_asks_tidy is null then
    raise exception 'bad_category';
  end if;

  begin
    if coalesce(p ->> 'job_month', '') !~ '^\d{4}-\d{2}-01$' then
      raise exception 'bad_job_month';
    end if;
    v_month := (p ->> 'job_month')::date;
  exception when others then
    raise exception 'bad_job_month';
  end;
  if v_month > v_this_month or v_month < (v_this_month - interval '36 months')::date then
    raise exception 'bad_job_month';
  end if;

  if v_asks_tidy and jsonb_typeof(p -> 'tidy') is distinct from 'boolean' then
    raise exception 'tidy_required';
  end if;
  if not v_asks_tidy and coalesce(jsonb_typeof(p -> 'tidy'), 'null') <> 'null' then
    raise exception 'tidy_not_asked';
  end if;

  v_comment := nullif(btrim(coalesce(p ->> 'comment', '')), '');
  if char_length(v_comment) > 400 then
    raise exception 'comment_too_long';
  end if;
  -- Ten or more digits, however they are spaced or punctuated, is a phone number.
  if v_comment ~ '([0-9][ ().-]*){10,}' then
    raise exception 'comment_has_phone';
  end if;

  begin
    category_id := v_cat;
    job_month := v_month;
    value_band := (p ->> 'value_band')::public.value_band;
    on_time := (p ->> 'on_time')::public.on_time_answer;
    on_price := (p ->> 'on_price')::public.on_price_answer;
    quality := (p ->> 'quality')::smallint;
    use_again := (p ->> 'use_again')::public.use_again_answer;
  exception when others then
    raise exception 'bad_input';
  end;
  if value_band is null or on_time is null or on_price is null or use_again is null
     or quality is null or quality not between 1 and 5 then
    raise exception 'bad_input';
  end if;
  tidy := case when v_asks_tidy then (p ->> 'tidy')::boolean end;
  comment := v_comment;
  return next;
end;
$$;
revoke execute on function private.review_fields(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- submit / edit
create or replace function public.submit_review(p jsonb, p_device_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_provider uuid;
  v_block text;
  f record;
  v_id uuid;
  v_status public.review_status;
begin
  if v_uid is null then
    raise exception 'not_member';
  end if;
  begin
    v_provider := (p ->> 'provider_id')::uuid;
  exception when others then
    v_provider := null;
  end;
  -- One posting at a time per person, so a double tap cannot slip two reviews past the 24-hour rule.
  perform pg_advisory_xact_lock(hashtext('submit_review:' || v_uid::text));

  v_block := private.review_block_reason(v_uid, v_provider);
  if v_block is not null then
    raise exception '%', v_block;
  end if;
  select * into f from private.review_fields(v_provider, p);

  begin
    insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price,
                                quality, tidy, use_again, comment, status, device_hash)
    values (v_provider, v_uid, f.category_id, f.job_month, f.value_band, f.on_time, f.on_price,
            f.quality, f.tidy, f.use_again, f.comment, 'published', nullif(p_device_hash, ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_reviewed';
  end;

  perform private.run_review_flags(v_id);
  select status into v_status from public.reviews where id = v_id;
  return jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

create or replace function public.edit_review(p_id uuid, p jsonb, p_device_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r public.reviews;
  v_profile public.profiles;
  f record;
  v_status public.review_status;
begin
  select * into r from public.reviews where id = p_id;
  if r.id is null or r.reviewer_id is distinct from v_uid then
    raise exception 'not_your_review';
  end if;
  select * into v_profile from public.profiles where user_id = v_uid;
  if v_profile.user_id is null or v_profile.deleted_at is not null or v_profile.display_name is null then
    raise exception 'not_member';
  end if;
  if v_profile.blocked_at is not null then
    raise exception 'blocked';
  end if;
  if r.status = 'removed' or r.created_at <= now() - interval '14 days' then
    raise exception 'edit_window_closed';
  end if;

  select * into f from private.review_fields(r.provider_id, p);
  update public.reviews set
    category_id = f.category_id, job_month = f.job_month, value_band = f.value_band, on_time = f.on_time,
    on_price = f.on_price, quality = f.quality, tidy = f.tidy, use_again = f.use_again, comment = f.comment,
    edited_at = now()
  where id = p_id;

  perform private.run_review_flags(p_id);
  select status into v_status from public.reviews where id = p_id;
  return jsonb_build_object('id', p_id, 'status', v_status);
end;
$$;

-- ---------------------------------------------------------------- reads for the signed-in pages
create or replace function public.review_form_context(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_provider public.providers;
  v_existing jsonb;
begin
  select * into v_provider from public.providers where slug = p_slug and status = 'live';
  if v_provider.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', r.id, 'category_id', r.category_id, 'job_month', to_char(r.job_month, 'YYYY-MM-DD'),
    'value_band', r.value_band, 'on_time', r.on_time, 'on_price', r.on_price, 'quality', r.quality,
    'tidy', r.tidy, 'use_again', r.use_again, 'comment', r.comment, 'status', r.status,
    'editable_until', r.created_at + interval '14 days',
    'has_active_proof', exists (select 1 from public.review_proofs pr where pr.review_id = r.id and pr.outcome in ('pending', 'accepted'))
  ) into v_existing
  from public.reviews r
  where r.provider_id = v_provider.id and r.reviewer_id = v_uid and r.status <> 'removed';

  return jsonb_build_object(
    'provider', jsonb_build_object('id', v_provider.id, 'slug', v_provider.slug, 'business_name', v_provider.business_name),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'asks_tidy', g.asks_tidy) order by c.name)
      from public.provider_categories pc
      join public.categories c on c.id = pc.category_id
      join public.category_groups g on g.id = c.group_id
      where pc.provider_id = v_provider.id and c.active and public.category_visible(v_provider.id, c.id)
    ), '[]'::jsonb),
    'existing', v_existing,
    'blocked', case when v_existing is null then private.review_block_reason(v_uid, v_provider.id) end
  );
end;
$$;

create or replace function public.my_reviews() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'provider_slug', p.slug, 'business_name', p.business_name, 'status', r.status,
    'removal_reason', r.removal_reason, 'created_at', r.created_at, 'editable_until', r.created_at + interval '14 days'
  ) order by r.created_at desc), '[]'::jsonb)
  from public.reviews r
  join public.providers p on p.id = r.provider_id
  where r.reviewer_id = auth.uid();
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.submit_review(jsonb, text)',
    'public.edit_review(uuid, jsonb, text)',
    'public.review_form_context(text)',
    'public.my_reviews()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000004', 'review_posting') on conflict do nothing;

-- ==================================================================== 20261012000005_review_flags.sql
-- Auto-flag rules and reports (Plan 2, Task 7). Replaces the run_review_flags stub from 000004.
-- Rules (spec §7, applied the same way to praise and to complaints), over the provider's non-removed reviews:
--   burst_48h                  3+ reviews created in the last 48 hours        -> every review in that window
--   accounts_created_together  3+ reviewers whose accounts were created within
--                              10 minutes of this reviewer's                  -> those reviewers' reviews
--   shared_device              another reviewer's review on the same device   -> both reviews
--   lone_extreme_new_account   account under 24 hours old, its only review,
--                              and 5 stars or 1 star                           -> this review
-- A flag is recorded once per (review, rule); only a newly recorded flag moves a published review to
-- under_check, so an admin's clearance sticks. Flagged reviews stay public with an "under check" label.

create or replace function private.run_review_flags(p_review uuid) returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reviews;
  v_created timestamptz;
  v_ids uuid[];
  v_rules text[];
  v_new uuid[];
begin
  select * into r from public.reviews where id = p_review;
  if r.id is null or r.status = 'removed' then
    return '{}'::text[];
  end if;
  select created_at into v_created from auth.users where id = r.reviewer_id;

  with live as (
    select x.id, x.reviewer_id, x.created_at, x.device_hash, u.created_at as account_created
    from public.reviews x
    left join auth.users u on u.id = x.reviewer_id
    where x.provider_id = r.provider_id and x.status <> 'removed'
  ),
  burst as (
    select id, 'burst_48h'::text as rule from live
    where created_at > now() - interval '48 hours'
      and (select count(*) from live where created_at > now() - interval '48 hours') >= 3
  ),
  together as (
    select id, 'accounts_created_together'::text from live
    where v_created is not null
      and account_created between v_created - interval '10 minutes' and v_created + interval '10 minutes'
      and (select count(distinct reviewer_id) from live
           where account_created between v_created - interval '10 minutes' and v_created + interval '10 minutes') >= 3
  ),
  device as (
    select id, 'shared_device'::text from live
    where r.device_hash is not null
      and device_hash = r.device_hash
      and exists (select 1 from live o where o.device_hash = r.device_hash and o.reviewer_id <> r.reviewer_id)
  ),
  extreme as (
    select r.id, 'lone_extreme_new_account'::text
    where v_created > now() - interval '24 hours'
      and r.quality in (1, 5)
      and (select count(*) from public.reviews where reviewer_id = r.reviewer_id) = 1
  ),
  hits as (
    select * from burst union select * from together union select * from device union select * from extreme
  )
  select array_agg(id), array_agg(rule) into v_ids, v_rules from hits;

  if v_ids is null then
    return '{}'::text[];
  end if;

  with ins as (
    insert into public.flags (target_type, target_id, source, rule)
    select 'review', h.id, 'auto', h.rule from unnest(v_ids, v_rules) as h(id, rule)
    on conflict (target_type, target_id, rule) where source = 'auto' do nothing
    returning target_id
  )
  select array_agg(distinct target_id) into v_new from ins;

  if v_new is not null then
    update public.reviews set status = 'under_check' where id = any (v_new) and status = 'published';
  end if;

  return coalesce((
    select array_agg(distinct h.rule order by h.rule) from unnest(v_ids, v_rules) as h(id, rule) where h.id = p_review
  ), '{}'::text[]);
end;
$$;
revoke execute on function private.run_review_flags(uuid) from public, anon, authenticated;

-- A signed-in member reports a review for the admin to look at. A report never changes the review.
create or replace function public.report_review(p_review uuid, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not exists (select 1 from public.profiles where user_id = v_uid and deleted_at is null and display_name is not null) then
    raise exception 'not_member';
  end if;
  if char_length(v_note) not between 1 and 500 then
    raise exception 'report_note_required';
  end if;
  if not exists (
    select 1 from public.reviews x join public.providers p on p.id = x.provider_id
    where x.id = p_review and x.status in ('published', 'under_check') and p.status = 'live'
  ) then
    raise exception 'review_not_found';
  end if;
  begin
    insert into public.flags (target_type, target_id, source, rule, note, reporter_id)
    values ('review', p_review, 'user', 'user_report', v_note, v_uid);
  exception when unique_violation then
    raise exception 'already_reported';
  end;
end;
$$;
revoke execute on function public.report_review(uuid, text) from public, anon;
grant execute on function public.report_review(uuid, text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000005', 'review_flags') on conflict do nothing;

-- ==================================================================== 20261012000006_review_public.sql
-- Public reviews (Plan 2, Task 8): a second read-only door, review_public, and provider_public gains
-- verified_job_count (appended last, so `create or replace view` keeps the existing columns).
-- Like provider_public, both views run with the owner's rights (postgres) and expose nothing private:
-- no reviewer id, device hash, removal reason or proof path; no phone numbers.

create or replace view public.provider_public
with (security_barrier = true) as
select
  p.id,
  p.slug,
  p.business_name,
  p.contact_name,
  p.areas,
  p.bio,
  (p.verified_at is not null) as is_verified,
  (p.whatsapp_e164 is not null) as has_whatsapp,
  coalesce((
    select array_agg(c.slug order by c.slug)
    from public.provider_categories pc
    join public.categories c on c.id = pc.category_id
    where pc.provider_id = p.id
      and c.active
      and private.category_visible(p.id, c.id)
  ), '{}'::text[]) as category_slugs,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'kind', ck.kind,
      'expires_on', ck.expires_on,
      'checked_at', ck.checked_at
    ) order by ck.checked_at, ck.kind)
    from public.provider_checks ck
    where ck.provider_id = p.id
      and (ck.expires_on is null or ck.expires_on >= current_date)
  ), '[]'::jsonb) as checks,
  s.review_count,
  s.use_again_pct,
  s.on_time_pct,
  s.on_price_pct,
  s.tidy_pct,
  s.score,
  (
    select max(r.created_at) from public.reviews r
    where r.provider_id = p.id and r.status in ('published', 'under_check')
  ) as last_review_at,
  p.created_at,
  (
    select count(*)::int from public.reviews r
    where r.provider_id = p.id and r.status in ('published', 'under_check')
      and exists (select 1 from public.review_proofs pr where pr.review_id = r.id and pr.outcome = 'accepted')
  ) as verified_job_count
from public.providers p
cross join lateral private.provider_stats(p.id) s
where p.status = 'live';

alter view public.provider_public owner to postgres;
grant select on public.provider_public to anon, authenticated;

-- Reviews that show publicly: live provider, status published or under_check (labelled), reviewer not deleted.
create or replace view public.review_public
with (security_barrier = true) as
select
  r.id,
  r.provider_id,
  p.slug as provider_slug,
  c.name as category_name,
  r.job_month,
  r.value_band,
  r.on_time,
  r.on_price,
  r.quality,
  r.tidy,
  r.use_again,
  r.comment,
  (r.status = 'under_check') as under_check,
  coalesce(pr.display_name, 'Bolton resident') as reviewer_name,
  coalesce(pr.group_member_at is not null, false) as group_member,
  exists (select 1 from public.review_proofs f where f.review_id = r.id and f.outcome = 'accepted') as verified_job,
  rr.body as reply_body,
  rr.created_at as reply_at,
  r.created_at,
  r.edited_at
from public.reviews r
join public.providers p on p.id = r.provider_id and p.status = 'live'
join public.categories c on c.id = r.category_id
left join public.profiles pr on pr.user_id = r.reviewer_id
left join public.review_responses rr on rr.review_id = r.id and rr.status = 'published'
where r.status in ('published', 'under_check')
  and pr.deleted_at is null;

alter view public.review_public owner to postgres;
revoke all on public.review_public from public, anon, authenticated;
grant select on public.review_public to anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000006', 'review_public') on conflict do nothing;

-- ==================================================================== 20261012000007_review_proofs.sql
-- Review proofs (Plan 2, Task 10): a private Storage bucket for proof files and the function that records one.
-- Files are uploaded by the app's server with the service role (after stripping image metadata); there are no
-- storage policies, so browsers can never list or read the bucket. Only the admin sees proofs, through
-- 60-second signed URLs. Re-runnable.

-- The local stack has no Storage service (no storage schema), so the bucket is created only where it exists.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('review-proofs', 'review-proofs', false, 10485760,
            array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do update set
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- Records an uploaded proof against the caller's own review, while the review can still be edited.
create or replace function public.add_review_proof(p_review uuid, p_path text, p_mime text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reviews;
  v_id uuid;
begin
  select * into r from public.reviews where id = p_review;
  if r.id is null or r.reviewer_id is distinct from auth.uid() then
    raise exception 'not_your_review';
  end if;
  if r.status = 'removed' or r.created_at <= now() - interval '14 days' then
    raise exception 'edit_window_closed';
  end if;
  if p_path is null or left(p_path, char_length(p_review::text) + 1) <> p_review::text || '/'
     or p_path like '%..%' or char_length(p_path) > 200 then
    raise exception 'bad_proof_path';
  end if;
  if p_mime is null or p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'bad_proof_type';
  end if;
  begin
    insert into public.review_proofs (review_id, storage_path, mime_type)
    values (p_review, p_path, p_mime)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'proof_exists';
  end;
  return v_id;
end;
$$;
revoke execute on function public.add_review_proof(uuid, text, text) from public, anon, authenticated;
grant execute on function public.add_review_proof(uuid, text, text) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000007', 'review_proofs') on conflict do nothing;

-- ==================================================================== 20261012000008_admin_moderation.sql
-- Admin moderation (Plan 2, Task 11): reviews under check, flags (automatic and reports), proofs and replies.
-- Every function is SECURITY DEFINER, raises 'not admin' unless is_admin(), and writes one audit_log row per
-- write. Removal needs a reason, is stored on the row, and is final (no restore in Plan 2). Re-runnable.

-- ---------------------------------------------------------------- reads
create or replace function public.admin_counts() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'under_check', (select count(*) from public.reviews where status = 'under_check'),
    'open_flags', (select count(*) from public.flags where status = 'open'),
    'pending_proofs', (select count(*) from public.review_proofs pr join public.reviews r on r.id = pr.review_id
                       where pr.outcome = 'pending' and r.status <> 'removed')
  );
end;
$$;

-- One review as the admin sees it (no device hash; the reviewer's name and account age instead).
create or replace function private.admin_review_json(p_review uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'status', r.status, 'created_at', r.created_at, 'edited_at', r.edited_at,
    'job_month', r.job_month, 'value_band', r.value_band, 'on_time', r.on_time, 'on_price', r.on_price,
    'quality', r.quality, 'tidy', r.tidy, 'use_again', r.use_again, 'comment', r.comment,
    'category_name', c.name, 'provider_slug', p.slug, 'business_name', p.business_name,
    'reviewer_name', coalesce(pr.display_name, 'Deleted account'), 'account_created_at', u.created_at,
    'reviewer_review_count', (select count(*) from public.reviews x where x.reviewer_id = r.reviewer_id)
  )
  from public.reviews r
  join public.providers p on p.id = r.provider_id
  join public.categories c on c.id = r.category_id
  left join public.profiles pr on pr.user_id = r.reviewer_id
  left join auth.users u on u.id = r.reviewer_id
  where r.id = p_review;
$$;
revoke execute on function private.admin_review_json(uuid) from public, anon, authenticated;

create or replace function public.admin_list_reviews_under_check() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(private.admin_review_json(r.id) || jsonb_build_object('flags', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'rule', f.rule, 'source', f.source, 'note', f.note,
                                          'created_at', f.created_at) order by f.created_at)
      from public.flags f where f.target_type = 'review' and f.target_id = r.id and f.status = 'open'
    ), '[]'::jsonb)) order by r.created_at)
    from public.reviews r where r.status = 'under_check'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_open_flags() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'target_type', f.target_type, 'target_id', f.target_id, 'source', f.source, 'rule', f.rule,
      'note', f.note, 'created_at', f.created_at,
      'reporter_name', (select display_name from public.profiles where user_id = f.reporter_id),
      'review', case
        when f.target_type = 'review' then private.admin_review_json(f.target_id)
        else private.admin_review_json((select review_id from public.review_responses where id = f.target_id))
      end,
      'reply_body', case when f.target_type = 'reply' then (select body from public.review_responses where id = f.target_id) end
    ) order by f.created_at)
    from public.flags f where f.status = 'open'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_pending_proofs() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pr.id, 'mime_type', pr.mime_type, 'created_at', pr.created_at,
      'review', private.admin_review_json(pr.review_id)
    ) order by pr.created_at)
    from public.review_proofs pr
    join public.reviews r on r.id = pr.review_id
    where pr.outcome = 'pending' and r.status <> 'removed'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_proof_path(p_proof uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return (select storage_path from public.review_proofs where id = p_proof);
end;
$$;

-- ---------------------------------------------------------------- writes
-- under_check -> published (clear: resolves the review's open automatic flags; a report stays for its own answer)
-- published   -> under_check (reason required)
-- published | under_check -> removed (reason required and stored; resolves all the review's open flags)
-- Anything else, including any way back from removed, is refused.
create or replace function public.admin_set_review_status(p_review uuid, p_status public.review_status, p_reason text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reviews;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_action text;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  select * into r from public.reviews where id = p_review for update;
  if r.id is null then
    raise exception 'review not found' using errcode = 'P0002';
  end if;

  if r.status = 'under_check' and p_status = 'published' then
    v_action := 'clear_review';
    update public.flags set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
      resolution_note = coalesce(v_reason, 'Cleared')
    where target_type = 'review' and target_id = p_review and status = 'open' and source = 'auto';
  elsif r.status = 'published' and p_status = 'under_check' then
    if v_reason is null then
      raise exception 'a reason is required to put a review under check' using errcode = 'check_violation';
    end if;
    v_action := 'check_review';
  elsif r.status in ('published', 'under_check') and p_status = 'removed' then
    if v_reason is null then
      raise exception 'a reason is required to remove a review' using errcode = 'check_violation';
    end if;
    v_action := 'remove_review';
    update public.flags set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
      resolution_note = 'Review removed: ' || v_reason
    where target_type = 'review' and target_id = p_review and status = 'open';
  else
    raise exception 'transition not allowed';
  end if;

  update public.reviews
  set status = p_status,
      removal_reason = case when p_status = 'removed' then v_reason else removal_reason end
  where id = p_review;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), v_action, 'review', p_review::text, v_reason);
  return (select slug from public.providers where id = r.provider_id);
end;
$$;

create or replace function public.admin_resolve_flag(p_flag uuid, p_outcome text, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('resolved', 'dismissed') then
    raise exception 'outcome must be resolved or dismissed' using errcode = 'check_violation';
  end if;
  update public.flags
  set status = p_outcome, resolved_by = auth.uid(), resolved_at = now(),
      resolution_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_flag and status = 'open';
  if not found then
    raise exception 'flag not open';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'resolve_flag', 'flag', p_flag::text, p_outcome || coalesce(': ' || nullif(btrim(p_note), ''), ''));
end;
$$;

create or replace function public.admin_check_proof(p_proof uuid, p_outcome text, p_note text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_review uuid;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('accepted', 'rejected') then
    raise exception 'outcome must be accepted or rejected' using errcode = 'check_violation';
  end if;
  update public.review_proofs
  set outcome = p_outcome, checked_at = now(), checked_by = auth.uid(),
      note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_proof and outcome = 'pending'
  returning review_id into v_review;
  if v_review is null then
    raise exception 'proof already checked';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'check_proof', 'proof', p_proof::text, p_outcome || coalesce(': ' || nullif(btrim(p_note), ''), ''));
  return (select p.slug from public.reviews r join public.providers p on p.id = r.provider_id where r.id = v_review);
end;
$$;

create or replace function public.admin_remove_reply(p_reply uuid, p_reason text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_provider uuid;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'a reason is required to remove a reply' using errcode = 'check_violation';
  end if;
  update public.review_responses set status = 'removed', removal_reason = v_reason
  where id = p_reply and status = 'published'
  returning provider_id into v_provider;
  if v_provider is null then
    raise exception 'reply not found' using errcode = 'P0002';
  end if;
  update public.flags set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
    resolution_note = 'Reply removed: ' || v_reason
  where target_type = 'reply' and target_id = p_reply and status = 'open';
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'remove_reply', 'reply', p_reply::text, v_reason);
  return (select slug from public.providers where id = v_provider);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_counts()',
    'public.admin_list_reviews_under_check()',
    'public.admin_list_open_flags()',
    'public.admin_list_pending_proofs()',
    'public.admin_proof_path(uuid)',
    'public.admin_set_review_status(uuid, public.review_status, text)',
    'public.admin_resolve_flag(uuid, text, text)',
    'public.admin_check_proof(uuid, text, text)',
    'public.admin_remove_reply(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000008', 'admin_moderation') on conflict do nothing;

-- ==================================================================== 20261012000009_provider_replies.sql
-- Provider replies (Plan 2, Task 12): a provider signed in with the number on their listing sees the reviews of
-- their listing(s) and replies, once per review, editable for 14 days. Replies go live at once; the admin can
-- remove one for cause (admin_remove_reply). Re-runnable.

create or replace function public.provider_my_reviews() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider', jsonb_build_object('id', p.id, 'slug', p.slug, 'business_name', p.business_name, 'status', p.status),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'created_at', r.created_at, 'job_month', r.job_month,
        'reviewer_name', coalesce(pr.display_name, 'Bolton resident'),
        'category_name', c.name, 'quality', r.quality, 'use_again', r.use_again, 'on_time', r.on_time,
        'on_price', r.on_price, 'tidy', r.tidy, 'value_band', r.value_band, 'comment', r.comment,
        'reply', case when rr.id is null then null else jsonb_build_object(
          'id', rr.id, 'body', rr.body, 'status', rr.status, 'created_at', rr.created_at,
          'editable_until', rr.created_at + interval '14 days') end
      ) order by r.created_at desc)
      from public.reviews r
      join public.categories c on c.id = r.category_id
      left join public.profiles pr on pr.user_id = r.reviewer_id
      left join public.review_responses rr on rr.review_id = r.id
      where r.provider_id = p.id and r.status in ('published', 'under_check') and pr.deleted_at is null
    ), '[]'::jsonb)
  ) order by p.business_name), '[]'::jsonb)
  from public.providers p
  where p.user_id = auth.uid() and p.status <> 'removed';
$$;

-- Posts the provider's reply to a review of their own listing, or edits it within 14 days.
create or replace function public.provider_reply(p_review uuid, p_body text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r public.reviews;
  v_slug text;
  v_body text := btrim(coalesce(p_body, ''));
  v_existing public.review_responses;
begin
  select * into r from public.reviews where id = p_review;
  select p.slug into v_slug from public.providers p
  where p.id = r.provider_id and p.user_id = v_uid and v_uid is not null and p.status <> 'removed';
  if r.id is null or v_slug is null then
    raise exception 'not_your_listing';
  end if;
  if exists (select 1 from public.profiles where user_id = v_uid and blocked_at is not null) then
    raise exception 'blocked';
  end if;
  if r.status not in ('published', 'under_check') then
    raise exception 'review_not_found';
  end if;
  if v_body = '' then
    raise exception 'reply_empty';
  end if;
  if char_length(v_body) > 400 then
    raise exception 'reply_too_long';
  end if;
  -- Ten or more digits, however they are spaced or punctuated, is a phone number (as for reviews).
  if v_body ~ '([0-9][ ().-]*){10,}' then
    raise exception 'reply_has_phone';
  end if;

  select * into v_existing from public.review_responses where review_id = p_review for update;
  if v_existing.id is null then
    begin
      insert into public.review_responses (review_id, provider_id, author_id, body)
      values (p_review, r.provider_id, v_uid, v_body);
    exception when unique_violation then
      raise exception 'edit_window_closed';
    end;
  elsif v_existing.status = 'removed' then
    raise exception 'reply_removed';
  elsif v_existing.created_at <= now() - interval '14 days' then
    raise exception 'edit_window_closed';
  else
    update public.review_responses set body = v_body, edited_at = now() where id = v_existing.id;
  end if;
  return v_slug;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.provider_my_reviews()', 'public.provider_reply(uuid, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000009', 'provider_replies') on conflict do nothing;

-- ==================================================================== 20261012000010_account_deletion.sql
-- Plan 2, Task 13: account deletion with phone retention, and the proof state on my_reviews.
-- Re-runnable: create if not exists / create or replace.

-- ---------------------------------------------------------------- phone_retention
-- Deleted people's phone numbers, kept privately for 12 months in case of legal claims (privacy notice).
-- Readable only by the database owner (the SQL editor); no API role can touch it.
create table if not exists public.phone_retention (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  phone_e164 text not null,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '12 months'
);
create index if not exists phone_retention_user_idx on public.phone_retention (user_id);
create index if not exists phone_retention_purge_idx on public.phone_retention (purge_after);
alter table public.phone_retention enable row level security;
revoke all on table public.phone_retention from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- delete_my_account
-- Idempotent: a retry after a failed Auth soft delete repeats it safely. Returns the slugs of the
-- providers whose public pages change, so the caller can revalidate them.
create or replace function public.delete_my_account() returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_slugs text[];
  c_reason constant text := 'Reviewer deleted their account';
begin
  if v_uid is null then
    raise exception 'not_member';
  end if;

  delete from public.phone_retention where purge_after < now();

  select nullif(btrim(u.phone), '') into v_phone from auth.users u where u.id = v_uid;
  if v_phone is not null and not exists (select 1 from public.phone_retention r where r.user_id = v_uid) then
    insert into public.phone_retention (user_id, phone_e164) values (v_uid, '+' || ltrim(v_phone, '+'));
  end if;

  with taken_down as (
    update public.reviews r set status = 'removed', removal_reason = c_reason
    where r.reviewer_id = v_uid and r.status <> 'removed'
    returning r.provider_id
  ), replies as (
    update public.review_responses rr set status = 'removed', removal_reason = c_reason
    where rr.author_id = v_uid and rr.status <> 'removed'
    returning rr.provider_id
  ), unlinked as (
    update public.providers p set user_id = null
    where p.user_id = v_uid
    returning p.id
  )
  select coalesce(array_agg(distinct p.slug order by p.slug), '{}') into v_slugs
  from public.providers p
  where p.id in (select provider_id from taken_down union select provider_id from replies union select id from unlinked);

  update public.profiles set deleted_at = coalesce(deleted_at, now()), display_name = null where user_id = v_uid;

  if not exists (select 1 from public.audit_log a where a.actor_id = v_uid and a.action = 'delete_account') then
    insert into public.audit_log (actor_id, action, target_type, target_id) values (v_uid, 'delete_account', 'user', v_uid::text);
  end if;

  return v_slugs;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------- my_reviews (+ proof state)
-- Same shape as before plus `proof`: the newest proof's outcome (pending / accepted / rejected) or null.
create or replace function public.my_reviews() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'provider_slug', p.slug, 'business_name', p.business_name, 'status', r.status,
    'removal_reason', r.removal_reason, 'created_at', r.created_at, 'editable_until', r.created_at + interval '14 days',
    'proof', (select rp.outcome from public.review_proofs rp where rp.review_id = r.id order by rp.created_at desc limit 1)
  ) order by r.created_at desc), '[]'::jsonb)
  from public.reviews r
  join public.providers p on p.id = r.provider_id
  where r.reviewer_id = auth.uid();
$$;
revoke execute on function public.my_reviews() from public, anon;
grant execute on function public.my_reviews() to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000010', 'account_deletion') on conflict do nothing;

-- ==================================================================== 20261012000011_phone_signup_nonce.sql
-- Final review C1: bind every new phone account to one sign-in request made through the app.
--
-- Before: the auth.users guard accepted any insert for a number with an approved/sent otp_requests row in
-- the last 15 minutes. GoTrue's public /signup endpoint takes a phone AND a password, so anyone racing the
-- app's own signInWithOtp (or arriving within 15 minutes of a send) could create, or pre-plant a password
-- on, an account for a number they never received a text on.
--
-- Now:
--   * requestCode mints a random single-use nonce, stores only its sha256 on the approved row
--     (otp_approve, the only way to approve) and passes the nonce to GoTrue in the sign-up metadata;
--   * the guard accepts a phone insert only with a matching, approved, unconsumed row from the last
--     15 minutes, marks it consumed and strips the nonce from the metadata;
--   * an insert that arrives already confirmed (autoconfirm: phone confirmations switched off) is refused,
--     so a code sent to the phone is always needed;
--   * a phone-only account never holds a usable password: whatever GoTrue stored is replaced with a random
--     bcrypt hash on insert, on phone confirmation and on any later password change;
--   * changing an account's number is refused (the app has no such feature; deletion still obfuscates it).
-- Re-runnable.

alter table public.otp_requests add column if not exists nonce_hash text;
alter table public.otp_requests add column if not exists consumed_at timestamptz;
create unique index if not exists otp_requests_nonce_idx on public.otp_requests (nonce_hash) where nonce_hash is not null;

-- ---------------------------------------------------------------- otp_approve (service role only)
-- Marks a pending request approved (after the Lookup said "mobile") and binds it to the caller's nonce.
create or replace function public.otp_approve(p_request_id bigint, p_line_type text, p_nonce_hash text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_nonce_hash is null or p_nonce_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad nonce hash' using errcode = '22023';
  end if;
  update public.otp_requests
  set outcome = 'approved', line_type = coalesce(p_line_type, line_type), nonce_hash = p_nonce_hash
  where id = p_request_id and outcome = 'pending';
  if not found then
    raise exception 'request not pending' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function public.otp_approve(bigint, text, text) from public, anon, authenticated;
grant execute on function public.otp_approve(bigint, text, text) to service_role;

-- otp_record keeps recording every other outcome, but can no longer approve (an approval without a nonce
-- would be useless to the guard, and silently so).
create or replace function public.otp_record(p_request_id bigint, p_outcome text, p_line_type text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_outcome = 'approved' then
    raise exception 'approve with otp_approve' using errcode = '22023';
  end if;
  update public.otp_requests
  set outcome = p_outcome, line_type = coalesce(p_line_type, line_type)
  where id = p_request_id;
end;
$$;
revoke execute on function public.otp_record(bigint, text, text) from public, anon, authenticated;
grant execute on function public.otp_record(bigint, text, text) to service_role;

-- ---------------------------------------------------------------- random password hash
create or replace function private.random_password_hash() returns text
language sql volatile security definer set search_path = ''
as $$
  select extensions.crypt(encode(extensions.gen_random_bytes(32), 'base64'), extensions.gen_salt('bf'));
$$;
revoke execute on function private.random_password_hash() from public, anon, authenticated;

-- ---------------------------------------------------------------- auth.users guard (insert / phone change)
create or replace function private.guard_auth_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_e164 text;
  v_nonce text;
  v_request bigint;
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

  if coalesce(new.phone, '') <> '' then
    v_e164 := '+' || ltrim(new.phone, '+');
    v_nonce := nullif(new.raw_user_meta_data ->> 'bv_nonce', '');
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

-- ---------------------------------------------------------------- auth.users scrub (every update)
-- Phone-only accounts sign in by code only: a password set before the phone is confirmed, when it is
-- confirmed, or later, is replaced with a random one. The sign-up nonce never stays in the metadata.
create or replace function private.scrub_auth_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'bv_nonce' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'bv_nonce';
  end if;
  if new.deleted_at is null and coalesce(new.phone, '') <> '' and coalesce(new.email, '') = '' and (
       (old.phone_confirmed_at is null and new.phone_confirmed_at is not null)
       or new.encrypted_password is distinct from old.encrypted_password
     ) then
    new.encrypted_password := private.random_password_hash();
  end if;
  return new;
end;
$$;
revoke execute on function private.scrub_auth_user() from public, anon, authenticated;

drop trigger if exists bv_scrub_auth_user on auth.users;
create trigger bv_scrub_auth_user
  before update on auth.users
  for each row execute function private.scrub_auth_user();

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000011', 'phone_signup_nonce') on conflict do nothing;

-- ==================================================================== 20261012000012_sms_hook.sql
-- Final review I1: the monthly SMS cap, the number/IP limits and the Lookup only covered texts the app asked
-- for. Supabase also texts existing accounts directly (POST /auth/v1/otp, phone change, reauthentication),
-- which none of those checks saw.
--
-- With Supabase's Send SMS hook pointed at the app (/api/auth/sms-hook, README -> Deploying), Supabase hands
-- every text to the app instead of sending it, and the app asks sms_hook_gate first: a text goes out only for
-- a sign-in request that otp_gate let through and the Lookup approved in the last 5 minutes, once per request.
-- So every text counts towards the cap and passes the same limits. Re-runnable.
--
-- sms_hook_sends is its own table (not a column on otp_requests) on purpose: for a brand-new account the
-- auth.users guard has just updated the otp_requests row inside GoTrue's still-open transaction, and GoTrue
-- waits for this hook before committing. Updating that row here would wait on that lock until the hook timed out.

create table if not exists public.sms_hook_sends (
  request_id bigint primary key,
  phone_e164 text not null,
  created_at timestamptz not null default now()
);
create index if not exists sms_hook_sends_created_idx on public.sms_hook_sends (created_at);
alter table public.sms_hook_sends enable row level security;
revoke all on public.sms_hook_sends from public, anon, authenticated;

create or replace function public.sms_hook_gate(p_phone text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_e164 text;
  v_request bigint;
begin
  if p_phone is null or ltrim(btrim(p_phone), '+') !~ '^447[1-9][0-9]{8}$' then
    return 'refused';
  end if;
  v_e164 := '+' || ltrim(btrim(p_phone), '+');

  delete from public.sms_hook_sends where created_at < now() - interval '30 days';

  -- Plain reads only: never lock the otp_requests row (see above).
  select r.id into v_request
  from public.otp_requests r
  where r.phone_e164 = v_e164
    and r.outcome = 'approved'
    and r.created_at > now() - interval '5 minutes'
    and not exists (select 1 from public.sms_hook_sends s where s.request_id = r.id)
  order by r.id desc
  limit 1;
  if v_request is null then
    return 'refused';
  end if;

  insert into public.sms_hook_sends (request_id, phone_e164) values (v_request, v_e164)
  on conflict (request_id) do nothing;
  if not found then
    return 'refused';  -- a concurrent call used this request first
  end if;
  return 'ok';
end;
$$;
revoke execute on function public.sms_hook_gate(text) from public, anon, authenticated;
grant execute on function public.sms_hook_gate(text) to service_role;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000012', 'sms_hook') on conflict do nothing;

-- ==================================================================== 20261012000013_review_writes_server_only.sql
-- Final review 2, I1 (with M9 and M10): the review-writing functions are for the app's server only.
--
-- Before: submit_review / edit_review / add_review_proof were granted to `authenticated` and took the device
-- hash from the caller. The server action computed it, but anyone signed in could call the RPC through the
-- public API with their own session and pass a fresh or empty hash, so the shared-device rule never fired
-- for someone running several accounts. add_review_proof could also record a proof with no file behind it.
--
-- Now:
--   * submit_review(p_uid, p, p_device_hash), edit_review(p_uid, p_id, p, p_device_hash) and
--     add_review_proof(p_uid, p_review, p_path, p_mime) are service_role only. The server action passes the
--     user id from the verified session and the device hash it computed from the request; the browser
--     never chooses either. The old client-callable versions are dropped.
--   * An edit records the device it came from in reviews.edit_device_hash (the posting device stays in
--     device_hash), and the shared-device rule compares every device a review was posted or edited from.
-- Every other rule is unchanged. Re-runnable.

alter table public.reviews add column if not exists edit_device_hash text;

drop function if exists public.submit_review(jsonb, text);
drop function if exists public.edit_review(uuid, jsonb, text);
drop function if exists public.add_review_proof(uuid, text, text);

-- ---------------------------------------------------------------- auto-flag rules: every device counts
create or replace function private.run_review_flags(p_review uuid) returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reviews;
  v_created timestamptz;
  v_ids uuid[];
  v_rules text[];
  v_new uuid[];
  v_devices text[];
begin
  select * into r from public.reviews where id = p_review;
  if r.id is null or r.status = 'removed' then
    return '{}'::text[];
  end if;
  select created_at into v_created from auth.users where id = r.reviewer_id;
  -- Every device this review was posted or edited from.
  v_devices := array_remove(array[r.device_hash, r.edit_device_hash], null);

  with live as (
    select x.id, x.reviewer_id, x.created_at, array[x.device_hash, x.edit_device_hash] as devices,
           u.created_at as account_created
    from public.reviews x
    left join auth.users u on u.id = x.reviewer_id
    where x.provider_id = r.provider_id and x.status <> 'removed'
  ),
  burst as (
    select id, 'burst_48h'::text as rule from live
    where created_at > now() - interval '48 hours'
      and (select count(*) from live where created_at > now() - interval '48 hours') >= 3
  ),
  together as (
    select id, 'accounts_created_together'::text from live
    where v_created is not null
      and account_created between v_created - interval '10 minutes' and v_created + interval '10 minutes'
      and (select count(distinct reviewer_id) from live
           where account_created between v_created - interval '10 minutes' and v_created + interval '10 minutes') >= 3
  ),
  device as (
    select id, 'shared_device'::text from live
    where cardinality(v_devices) > 0
      and devices && v_devices
      and exists (select 1 from live o where o.devices && v_devices and o.reviewer_id <> r.reviewer_id)
  ),
  extreme as (
    select r.id, 'lone_extreme_new_account'::text
    where v_created > now() - interval '24 hours'
      and r.quality in (1, 5)
      and (select count(*) from public.reviews where reviewer_id = r.reviewer_id) = 1
  ),
  hits as (
    select * from burst union select * from together union select * from device union select * from extreme
  )
  select array_agg(id), array_agg(rule) into v_ids, v_rules from hits;

  if v_ids is null then
    return '{}'::text[];
  end if;

  with ins as (
    insert into public.flags (target_type, target_id, source, rule)
    select 'review', h.id, 'auto', h.rule from unnest(v_ids, v_rules) as h(id, rule)
    on conflict (target_type, target_id, rule) where source = 'auto' do nothing
    returning target_id
  )
  select array_agg(distinct target_id) into v_new from ins;

  if v_new is not null then
    update public.reviews set status = 'under_check' where id = any (v_new) and status = 'published';
  end if;

  return coalesce((
    select array_agg(distinct h.rule order by h.rule) from unnest(v_ids, v_rules) as h(id, rule) where h.id = p_review
  ), '{}'::text[]);
end;
$$;
revoke execute on function private.run_review_flags(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- submit / edit (service role only)
create or replace function public.submit_review(p_uid uuid, p jsonb, p_device_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := p_uid;
  v_provider uuid;
  v_block text;
  f record;
  v_id uuid;
  v_status public.review_status;
begin
  if v_uid is null then
    raise exception 'not_member';
  end if;
  begin
    v_provider := (p ->> 'provider_id')::uuid;
  exception when others then
    v_provider := null;
  end;
  -- One posting at a time per person, so a double tap cannot slip two reviews past the 24-hour rule.
  perform pg_advisory_xact_lock(hashtext('submit_review:' || v_uid::text));

  v_block := private.review_block_reason(v_uid, v_provider);
  if v_block is not null then
    raise exception '%', v_block;
  end if;
  select * into f from private.review_fields(v_provider, p);

  begin
    insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price,
                                quality, tidy, use_again, comment, status, device_hash)
    values (v_provider, v_uid, f.category_id, f.job_month, f.value_band, f.on_time, f.on_price,
            f.quality, f.tidy, f.use_again, f.comment, 'published', nullif(p_device_hash, ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_reviewed';
  end;

  perform private.run_review_flags(v_id);
  select status into v_status from public.reviews where id = v_id;
  return jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

create or replace function public.edit_review(p_uid uuid, p_id uuid, p jsonb, p_device_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := p_uid;
  r public.reviews;
  v_profile public.profiles;
  f record;
  v_status public.review_status;
begin
  select * into r from public.reviews where id = p_id;
  if v_uid is null or r.id is null or r.reviewer_id is distinct from v_uid then
    raise exception 'not_your_review';
  end if;
  select * into v_profile from public.profiles where user_id = v_uid;
  if v_profile.user_id is null or v_profile.deleted_at is not null or v_profile.display_name is null then
    raise exception 'not_member';
  end if;
  if v_profile.blocked_at is not null then
    raise exception 'blocked';
  end if;
  if r.status = 'removed' or r.created_at <= now() - interval '14 days' then
    raise exception 'edit_window_closed';
  end if;

  select * into f from private.review_fields(r.provider_id, p);
  update public.reviews set
    category_id = f.category_id, job_month = f.job_month, value_band = f.value_band, on_time = f.on_time,
    on_price = f.on_price, quality = f.quality, tidy = f.tidy, use_again = f.use_again, comment = f.comment,
    edit_device_hash = coalesce(nullif(p_device_hash, ''), edit_device_hash),
    edited_at = now()
  where id = p_id;

  perform private.run_review_flags(p_id);
  select status into v_status from public.reviews where id = p_id;
  return jsonb_build_object('id', p_id, 'status', v_status);
end;
$$;

-- ---------------------------------------------------------------- proofs (service role only)
-- Called by the server action after it has uploaded the file, so a row always has a file behind it.
create or replace function public.add_review_proof(p_uid uuid, p_review uuid, p_path text, p_mime text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reviews;
  v_id uuid;
begin
  select * into r from public.reviews where id = p_review;
  if p_uid is null or r.id is null or r.reviewer_id is distinct from p_uid then
    raise exception 'not_your_review';
  end if;
  if r.status = 'removed' or r.created_at <= now() - interval '14 days' then
    raise exception 'edit_window_closed';
  end if;
  if p_path is null or left(p_path, char_length(p_review::text) + 1) <> p_review::text || '/'
     or p_path like '%..%' or char_length(p_path) > 200 then
    raise exception 'bad_proof_path';
  end if;
  if p_mime is null or p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'bad_proof_type';
  end if;
  begin
    insert into public.review_proofs (review_id, storage_path, mime_type)
    values (p_review, p_path, p_mime)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'proof_exists';
  end;
  return v_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.submit_review(uuid, jsonb, text)',
    'public.edit_review(uuid, uuid, jsonb, text)',
    'public.add_review_proof(uuid, uuid, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000013', 'review_writes_server_only') on conflict do nothing;

-- ==================================================================== 20261012000014_removal_survives_resignup.sql
-- Final review 2, I2: "removal is final" could be undone by deleting the account and signing up again with
-- the same mobile number (a new user id). phone_retention already keeps a deleted person's number for
-- 12 months, so review_block_reason now also looks at earlier accounts on the caller's number:
--   * blocked_at on an earlier account on this number         -> 'blocked'
--   * an earlier account's review of this provider removed for
--     cause (any reason but "Reviewer deleted their account") -> 'removed_before'
-- Retention rows past purge_after no longer count (they are deleted on the next account deletion).
-- Everything else is as in 000004. Re-runnable.

create index if not exists phone_retention_phone_idx on public.phone_retention (phone_e164);

create or replace function private.review_block_reason(p_uid uuid, p_provider uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_created timestamptz;
  v_e164 text;
begin
  select * into v_profile from public.profiles where user_id = p_uid;
  if v_profile.user_id is null or v_profile.deleted_at is not null or v_profile.display_name is null then
    return 'not_member';
  end if;
  select u.created_at, '+' || ltrim(nullif(btrim(u.phone), ''), '+') into v_created, v_e164
  from auth.users u where u.id = p_uid;

  if v_profile.blocked_at is not null then
    return 'blocked';
  end if;
  if v_e164 is not null and exists (
    select 1 from public.phone_retention pr
    join public.profiles op on op.user_id = pr.user_id
    where pr.phone_e164 = v_e164 and pr.user_id <> p_uid and pr.purge_after > now() and op.blocked_at is not null
  ) then
    return 'blocked';
  end if;
  if not exists (select 1 from public.providers where id = p_provider and status = 'live') then
    return 'provider_not_found';
  end if;
  if exists (select 1 from public.providers where id = p_provider and user_id = p_uid) then
    return 'own_listing';
  end if;
  if exists (
    select 1
    from public.providers mine
    join public.provider_categories mc on mc.provider_id = mine.id
    join public.provider_categories tc on tc.category_id = mc.category_id and tc.provider_id = p_provider
    where mine.user_id = p_uid and mine.status <> 'removed'
  ) then
    return 'shares_category';
  end if;
  if exists (
    select 1 from public.reviews
    where provider_id = p_provider and reviewer_id = p_uid and status = 'removed'
      and removal_reason is distinct from 'Reviewer deleted their account'
  ) then
    return 'removed_before';
  end if;
  if v_e164 is not null and exists (
    select 1 from public.phone_retention pr
    join public.reviews r on r.reviewer_id = pr.user_id
    where pr.phone_e164 = v_e164 and pr.user_id <> p_uid and pr.purge_after > now()
      and r.provider_id = p_provider and r.status = 'removed'
      and r.removal_reason is distinct from 'Reviewer deleted their account'
  ) then
    return 'removed_before';
  end if;
  if v_created > now() - interval '24 hours'
     and exists (select 1 from public.reviews where reviewer_id = p_uid) then
    return 'new_account_limit';
  end if;
  return null;
end;
$$;
revoke execute on function private.review_block_reason(uuid, uuid) from public, anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000014', 'removal_survives_resignup') on conflict do nothing;

-- ==================================================================== 20261012000015_otp_verify_limits.sql
-- Final review 2, I4: an app-side limit on wrong sign-in codes.
--
-- Supabase's "token verifications per 5 minutes per IP" limit sees only the app's server address, so it is
-- one bucket for the whole site: one visitor submitting ~150 wrong codes would make every resident's right
-- code fail until the window passed. The app now asks otp_verify_gate before every code check:
--   * 5 wrong codes for a number in 15 minutes  -> 'number_locked'
--   * 20 wrong codes from one connection in 1 hour (ip_hash; IPv6 grouped by /64 in the app) -> 'ip_locked'
-- An attempt counts from the moment it is let through until otp_verify_record marks it right ('ok'), so
-- parallel guesses can't slip past. Refused attempts are recorded as 'locked' and don't extend a lockout.
-- Limits live in settings.otp_verify_limits. Rows are kept a day. Each call also purges phone_retention rows
-- past purge_after (M4). Supabase's own limits stay as the outer ceiling.
-- Re-runnable.

create table if not exists public.otp_verify_attempts (
  id bigint generated always as identity primary key,
  phone_e164 text not null,
  ip_hash text not null,
  outcome text not null default 'pending' check (outcome in ('pending', 'ok', 'wrong', 'locked')),
  created_at timestamptz not null default now()
);
create index if not exists otp_verify_attempts_phone_idx on public.otp_verify_attempts (phone_e164, created_at);
create index if not exists otp_verify_attempts_ip_idx on public.otp_verify_attempts (ip_hash, created_at);
create index if not exists otp_verify_attempts_created_idx on public.otp_verify_attempts (created_at);
alter table public.otp_verify_attempts enable row level security;
revoke all on public.otp_verify_attempts from public, anon, authenticated;

insert into public.settings (key, value) values ('otp_verify_limits', '{"number_15m":5,"ip_1h":20}'::jsonb)
on conflict (key) do nothing;

create or replace function public.otp_verify_gate(p_phone text, p_ip_hash text)
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
  -- Phone lock first, then IP, always in that order (no deadlocks between concurrent checks).
  perform pg_advisory_xact_lock(hashtext('otp_verify:phone:' || coalesce(p_phone, '')));
  perform pg_advisory_xact_lock(hashtext('otp_verify:ip:' || coalesce(p_ip_hash, '')));
  delete from public.otp_verify_attempts where created_at < now() - interval '1 day';
  -- Final review 2, M4: deleted people's numbers go after 12 months, as the privacy notice says. This runs on
  -- every code check, so the purge doesn't wait for the next account deletion.
  delete from public.phone_retention where purge_after < now();

  select value into v_limits from public.settings where key = 'otp_verify_limits';
  v_limits := coalesce(v_limits, '{}'::jsonb);

  select count(*) into v_n from public.otp_verify_attempts
  where phone_e164 = p_phone and outcome in ('pending', 'wrong') and created_at > now() - interval '15 minutes';
  select count(*) into v_i from public.otp_verify_attempts
  where ip_hash = p_ip_hash and outcome in ('pending', 'wrong') and created_at > now() - interval '1 hour';

  if v_n >= coalesce((v_limits ->> 'number_15m')::int, 5) then
    v_verdict := 'number_locked';
  elsif v_i >= coalesce((v_limits ->> 'ip_1h')::int, 20) then
    v_verdict := 'ip_locked';
  end if;

  insert into public.otp_verify_attempts (phone_e164, ip_hash, outcome)
  values (coalesce(p_phone, ''), coalesce(p_ip_hash, ''), case when v_verdict = 'ok' then 'pending' else 'locked' end)
  returning id into v_id;
  return query select v_id, v_verdict;
end;
$$;

create or replace function public.otp_verify_record(p_attempt_id bigint, p_ok boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.otp_verify_attempts
  set outcome = case when p_ok then 'ok' else 'wrong' end
  where id = p_attempt_id and outcome = 'pending';
  if not found then
    raise exception 'unknown_attempt';
  end if;
end;
$$;

revoke execute on function public.otp_verify_gate(text, text) from public, anon, authenticated;
revoke execute on function public.otp_verify_record(bigint, boolean) from public, anon, authenticated;
grant execute on function public.otp_verify_gate(text, text) to service_role;
grant execute on function public.otp_verify_record(bigint, boolean) to service_role;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000015', 'otp_verify_limits') on conflict do nothing;

-- ==================================================================== 20261012000016_review2_minors.sql
-- Final review 2 minors. Re-runnable (create or replace; grants as before).
--   M1  Only an account that signed in with a confirmed mobile may review, report or reply. Before, the checks
--       looked at the profile only, so the email admin (after visiting Welcome) or an anonymous Supabase
--       session (if that switch were ever turned on) could post. Refused now: anonymous sessions, email-only
--       accounts and phone accounts whose number was never confirmed (bare-id test fixtures still pass).
--   M8  The admin account can't be deleted from the account page (delete_my_account raises 'admin_account'):
--       that soft-deletes the only admin. (An admin may still finish Welcome and keep role admin, as designed.)
--   M14 One person can file at most 10 reports in 24 hours ('report_limit').
-- (M4, the regular phone_retention purge, is in otp_verify_gate in 000015.)

-- ---------------------------------------------------------------- M1: signed in with a confirmed mobile
create or replace function private.phone_signed_in(p_uid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from auth.users u
    where u.id = p_uid and (
      coalesce(u.is_anonymous, false)
      or (coalesce(u.phone, '') = '' and coalesce(u.email, '') <> '')
      or (coalesce(u.phone, '') <> '' and u.phone_confirmed_at is null)
    )
  ) and p_uid is not null;
$$;
revoke execute on function private.phone_signed_in(uuid) from public, anon, authenticated;

create or replace function private.review_block_reason(p_uid uuid, p_provider uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_created timestamptz;
  v_e164 text;
begin
  select * into v_profile from public.profiles where user_id = p_uid;
  if v_profile.user_id is null or v_profile.deleted_at is not null or v_profile.display_name is null then
    return 'not_member';
  end if;
  if not private.phone_signed_in(p_uid) then
    return 'not_member';
  end if;
  select u.created_at, '+' || ltrim(nullif(btrim(u.phone), ''), '+') into v_created, v_e164
  from auth.users u where u.id = p_uid;

  if v_profile.blocked_at is not null then
    return 'blocked';
  end if;
  if v_e164 is not null and exists (
    select 1 from public.phone_retention pr
    join public.profiles op on op.user_id = pr.user_id
    where pr.phone_e164 = v_e164 and pr.user_id <> p_uid and pr.purge_after > now() and op.blocked_at is not null
  ) then
    return 'blocked';
  end if;
  if not exists (select 1 from public.providers where id = p_provider and status = 'live') then
    return 'provider_not_found';
  end if;
  if exists (select 1 from public.providers where id = p_provider and user_id = p_uid) then
    return 'own_listing';
  end if;
  if exists (
    select 1
    from public.providers mine
    join public.provider_categories mc on mc.provider_id = mine.id
    join public.provider_categories tc on tc.category_id = mc.category_id and tc.provider_id = p_provider
    where mine.user_id = p_uid and mine.status <> 'removed'
  ) then
    return 'shares_category';
  end if;
  if exists (
    select 1 from public.reviews
    where provider_id = p_provider and reviewer_id = p_uid and status = 'removed'
      and removal_reason is distinct from 'Reviewer deleted their account'
  ) then
    return 'removed_before';
  end if;
  if v_e164 is not null and exists (
    select 1 from public.phone_retention pr
    join public.reviews r on r.reviewer_id = pr.user_id
    where pr.phone_e164 = v_e164 and pr.user_id <> p_uid and pr.purge_after > now()
      and r.provider_id = p_provider and r.status = 'removed'
      and r.removal_reason is distinct from 'Reviewer deleted their account'
  ) then
    return 'removed_before';
  end if;
  if v_created > now() - interval '24 hours'
     and exists (select 1 from public.reviews where reviewer_id = p_uid) then
    return 'new_account_limit';
  end if;
  return null;
end;
$$;
revoke execute on function private.review_block_reason(uuid, uuid) from public, anon, authenticated;

create or replace function public.report_review(p_review uuid, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not exists (select 1 from public.profiles where user_id = v_uid and deleted_at is null and display_name is not null) then
    raise exception 'not_member';
  end if;
  if not private.phone_signed_in(v_uid) then
    raise exception 'not_member';
  end if;
  if char_length(v_note) not between 1 and 500 then
    raise exception 'report_note_required';
  end if;
  if not exists (
    select 1 from public.reviews x join public.providers p on p.id = x.provider_id
    where x.id = p_review and x.status in ('published', 'under_check') and p.status = 'live'
  ) then
    raise exception 'review_not_found';
  end if;
  -- At most 10 reports a day from one person (so one account can't report every review on the site).
  perform pg_advisory_xact_lock(hashtext('report_review:' || v_uid::text));
  if (select count(*) from public.flags
      where source = 'user' and reporter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'report_limit';
  end if;
  begin
    insert into public.flags (target_type, target_id, source, rule, note, reporter_id)
    values ('review', p_review, 'user', 'user_report', v_note, v_uid);
  exception when unique_violation then
    raise exception 'already_reported';
  end;
end;
$$;
revoke execute on function public.report_review(uuid, text) from public, anon;
grant execute on function public.report_review(uuid, text) to authenticated;

create or replace function public.provider_reply(p_review uuid, p_body text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r public.reviews;
  v_slug text;
  v_body text := btrim(coalesce(p_body, ''));
  v_existing public.review_responses;
begin
  select * into r from public.reviews where id = p_review;
  select p.slug into v_slug from public.providers p
  where p.id = r.provider_id and p.user_id = v_uid and v_uid is not null and p.status <> 'removed';
  if r.id is null or v_slug is null then
    raise exception 'not_your_listing';
  end if;
  if not private.phone_signed_in(v_uid) then
    raise exception 'not_member';
  end if;
  if exists (select 1 from public.profiles where user_id = v_uid and blocked_at is not null) then
    raise exception 'blocked';
  end if;
  if r.status not in ('published', 'under_check') then
    raise exception 'review_not_found';
  end if;
  if v_body = '' then
    raise exception 'reply_empty';
  end if;
  if char_length(v_body) > 400 then
    raise exception 'reply_too_long';
  end if;
  -- Ten or more digits, however they are spaced or punctuated, is a phone number (as for reviews).
  if v_body ~ '([0-9][ ().-]*){10,}' then
    raise exception 'reply_has_phone';
  end if;

  select * into v_existing from public.review_responses where review_id = p_review for update;
  if v_existing.id is null then
    begin
      insert into public.review_responses (review_id, provider_id, author_id, body)
      values (p_review, r.provider_id, v_uid, v_body);
    exception when unique_violation then
      raise exception 'edit_window_closed';
    end;
  elsif v_existing.status = 'removed' then
    raise exception 'reply_removed';
  elsif v_existing.created_at <= now() - interval '14 days' then
    raise exception 'edit_window_closed';
  else
    update public.review_responses set body = v_body, edited_at = now() where id = v_existing.id;
  end if;
  return v_slug;
end;
$$;
revoke execute on function public.provider_reply(uuid, text) from public, anon;
grant execute on function public.provider_reply(uuid, text) to authenticated;

-- ---------------------------------------------------------------- M8: the admin account stays an admin
create or replace function public.delete_my_account() returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_slugs text[];
  c_reason constant text := 'Reviewer deleted their account';
begin
  if v_uid is null then
    raise exception 'not_member';
  end if;
  if exists (select 1 from public.profiles where user_id = v_uid and role = 'admin') then
    raise exception 'admin_account';
  end if;

  delete from public.phone_retention where purge_after < now();

  select nullif(btrim(u.phone), '') into v_phone from auth.users u where u.id = v_uid;
  if v_phone is not null and not exists (select 1 from public.phone_retention r where r.user_id = v_uid) then
    insert into public.phone_retention (user_id, phone_e164) values (v_uid, '+' || ltrim(v_phone, '+'));
  end if;

  with taken_down as (
    update public.reviews r set status = 'removed', removal_reason = c_reason
    where r.reviewer_id = v_uid and r.status <> 'removed'
    returning r.provider_id
  ), replies as (
    update public.review_responses rr set status = 'removed', removal_reason = c_reason
    where rr.author_id = v_uid and rr.status <> 'removed'
    returning rr.provider_id
  ), unlinked as (
    update public.providers p set user_id = null
    where p.user_id = v_uid
    returning p.id
  )
  select coalesce(array_agg(distinct p.slug order by p.slug), '{}') into v_slugs
  from public.providers p
  where p.id in (select provider_id from taken_down union select provider_id from replies union select id from unlinked);

  update public.profiles set deleted_at = coalesce(deleted_at, now()), display_name = null where user_id = v_uid;

  if not exists (select 1 from public.audit_log a where a.actor_id = v_uid and a.action = 'delete_account') then
    insert into public.audit_log (actor_id, action, target_type, target_id) values (v_uid, 'delete_account', 'user', v_uid::text);
  end if;

  return v_slugs;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000016', 'review2_minors') on conflict do nothing;

-- ==================================================================== 20261012000017_owner_decisions.sql
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

insert into supabase_migrations.schema_migrations (version, name) values ('20261012000017', 'owner_decisions') on conflict do nothing;
commit;
select 'Plan 2 database changes applied' as result;
