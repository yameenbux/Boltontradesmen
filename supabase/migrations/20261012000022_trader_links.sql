-- Plan 2b Task 9: trader sign-in links.
--
-- With phone sign-in off, a trader can't be linked to their listing by the number on it any more. Instead the admin
-- makes a single-use link (14 days; a new one revokes the old) and sends it to the trader; whoever opens it first
-- while signed in, with a finished profile, gets the listing. Only the SHA-256 of the token is stored. The admin can
-- unlink with a logged reason (for example when the wrong person opened a forwarded link) and make a new link.
--
-- Listings linked this way stay linked when their numbers change: private.unlink_on_number_change() now unlinks
-- only an account whose own phone number matches neither of the listing's new numbers, and only when a number
-- actually changed. Re-runnable.

create table if not exists public.trader_link_tokens (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  used_by uuid,
  revoked_at timestamptz
);
create index if not exists trader_link_tokens_provider_idx on public.trader_link_tokens (provider_id, created_at desc);
alter table public.trader_link_tokens enable row level security;
revoke all on table public.trader_link_tokens from public, anon, authenticated, service_role;

-- The stored form of a token.
create or replace function private.trader_link_hash(p_token uuid) returns text
language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(p_token::text, 'UTF8')), 'hex') $$;
revoke execute on function private.trader_link_hash(uuid) from public, anon, authenticated;

-- Why a token can't be claimed by p_uid right now, or 'ok'. Shared by the preview and the claim (which locks first).
create or replace function private.trader_link_state(p_token_id uuid, p_uid uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  t public.trader_link_tokens;
  v_status public.provider_status;
  v_user uuid;
begin
  select * into t from public.trader_link_tokens where id = p_token_id;
  if not found then
    return 'link_invalid';
  end if;
  select p.status, p.user_id into v_status, v_user from public.providers p where p.id = t.provider_id;
  if t.revoked_at is not null or v_status is null or v_status not in ('consented', 'live', 'paused') then
    return 'link_invalid';
  end if;
  if t.used_at is not null then
    return 'link_used';
  end if;
  if t.expires_at <= now() then
    return 'link_expired';
  end if;
  if v_user is not null then
    return 'listing_already_linked';
  end if;
  if exists (select 1 from public.providers p where p.user_id = p_uid and p.status <> 'removed') then
    return 'account_already_linked';
  end if;
  return 'ok';
end;
$$;
revoke execute on function private.trader_link_state(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- admin: make a link
create or replace function public.admin_new_trader_link(p_provider uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.provider_status;
  v_user uuid;
  v_token uuid := gen_random_uuid();
  v_expires timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  select status, user_id into v_status, v_user from public.providers where id = p_provider for update;
  if not found then
    raise exception 'provider not found' using errcode = 'P0002';
  end if;
  if v_user is not null then
    raise exception 'listing_already_linked';
  end if;
  if v_status not in ('consented', 'live', 'paused') then
    raise exception 'provider not linkable' using errcode = 'check_violation';
  end if;
  update public.trader_link_tokens set revoked_at = now()
  where provider_id = p_provider and used_at is null and revoked_at is null;
  insert into public.trader_link_tokens (provider_id, token_hash, created_by)
  values (p_provider, private.trader_link_hash(v_token), auth.uid())
  returning expires_at into v_expires;
  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (auth.uid(), 'new_trader_link', 'provider', p_provider::text);
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end;
$$;

-- ---------------------------------------------------------------- the trader: preview and claim
create or replace function public.trader_link_preview(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
begin
  select t.id, p.business_name into v_id, v_name
  from public.trader_link_tokens t join public.providers p on p.id = t.provider_id
  where t.token_hash = private.trader_link_hash(p_token);
  if v_id is null then
    return jsonb_build_object('state', 'link_invalid');
  end if;
  return jsonb_build_object('state', private.trader_link_state(v_id, auth.uid()), 'business_name', v_name);
end;
$$;

create or replace function public.claim_trader_link(p_token uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.trader_link_tokens;
  v_state text;
  v_slug text;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles where user_id = v_uid and deleted_at is null and display_name is not null
  ) then
    raise exception 'not_member';
  end if;
  select * into t from public.trader_link_tokens where token_hash = private.trader_link_hash(p_token) for update;
  if not found then
    raise exception 'link_invalid';
  end if;
  perform 1 from public.providers where id = t.provider_id for update;
  v_state := private.trader_link_state(t.id, v_uid);
  if v_state <> 'ok' then
    raise exception '%', v_state;
  end if;

  update public.providers set user_id = v_uid where id = t.provider_id returning slug into v_slug;
  update public.profiles set role = 'provider' where user_id = v_uid and role = 'resident';
  update public.trader_link_tokens set used_at = now(), used_by = v_uid where id = t.id;
  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (v_uid, 'claim_trader_link', 'provider', t.provider_id::text);
  return v_slug;
end;
$$;

-- ---------------------------------------------------------------- admin: unlink
create or replace function public.admin_unlink_provider(p_provider uuid, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason is required' using errcode = 'check_violation';
  end if;
  select user_id into v_user from public.providers where id = p_provider for update;
  if not found then
    raise exception 'provider not found' using errcode = 'P0002';
  end if;
  if v_user is null then
    raise exception 'provider not linked' using errcode = 'check_violation';
  end if;
  update public.providers set user_id = null where id = p_provider;
  -- An account left with no listing goes back to being a resident.
  if not exists (select 1 from public.providers where user_id = v_user) then
    update public.profiles set role = 'resident' where user_id = v_user and role = 'provider';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'unlink_provider', 'provider', p_provider::text, btrim(p_reason));
end;
$$;

-- ---------------------------------------------------------------- number changes (000003 trigger, new body)
-- Unlink only an account with a phone number of its own that matches neither of the listing's new numbers, and only
-- when a number actually changed. Accounts linked by a trader link (Google or email, no phone) stay linked.
create or replace function private.unlink_on_number_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_phone text;
begin
  if new.user_id is null
     or (new.phone_e164 is not distinct from old.phone_e164 and new.whatsapp_e164 is not distinct from old.whatsapp_e164) then
    return new;
  end if;
  select nullif(ltrim(coalesce(u.phone, ''), '+'), '') into v_phone from auth.users u where u.id = new.user_id;
  if v_phone is not null
     and '+' || v_phone is distinct from new.phone_e164
     and '+' || v_phone is distinct from new.whatsapp_e164 then
    new.user_id := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.unlink_on_number_change() from public, anon, authenticated;

-- ---------------------------------------------------------------- admin_get_provider (000002 body + link state)
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
              from public.provider_checks ck where ck.provider_id = p.id), '[]'::jsonb),
    'linked', p.user_id is not null,
    'trader_link_expires_at', (
      select t.expires_at from public.trader_link_tokens t
      where t.provider_id = p.id and t.used_at is null and t.revoked_at is null and t.expires_at > now()
      order by t.created_at desc limit 1
    )
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
    'public.admin_new_trader_link(uuid)',
    'public.trader_link_preview(uuid)',
    'public.claim_trader_link(uuid)',
    'public.admin_unlink_provider(uuid, text)',
    'public.admin_get_provider(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
