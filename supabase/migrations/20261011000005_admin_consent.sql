-- Admin functions (Task 7) and consent flow (Task 8).
-- Every admin_* function: security definer, raises 'not admin' unless is_admin(), writes one audit_log row.
-- They are called with the signed-in admin's session (not the service key), so auth.uid() is the real actor.

create extension if not exists unaccent with schema extensions;

-- E.164 (+44) format for provider numbers.
do $$ begin
  alter table public.providers add constraint providers_phone_e164_format
    check (phone_e164 ~ '^\+44[0-9]{9,10}$');
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.providers add constraint providers_whatsapp_e164_format
    check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+44[0-9]{9,10}$');
exception when duplicate_object then null;
end $$;

-- ---- private helper: unique slug (not callable by anon/authenticated; schema `private` has no USAGE for them)
create or replace function private.unique_slug(p_name text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_base text;
  v_slug text;
  n int := 1;
begin
  v_base := lower(extensions.unaccent(coalesce(p_name, '')));
  v_base := regexp_replace(v_base, '[''’‘`]', '', 'g');
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  if v_base = '' then
    v_base := 'provider';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.providers where slug = v_slug) loop
    n := n + 1;
    v_slug := v_base || '-' || n;
  end loop;
  return v_slug;
end;
$$;
revoke execute on function private.unique_slug(text) from public, anon, authenticated;

-- ---- admin_upsert_provider
create or replace function public.admin_upsert_provider(p jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_areas text[];
  v_cats uuid[];
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;

  v_id := nullif(p ->> 'id', '')::uuid;
  v_areas := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'areas', '[]'::jsonb))), '{}');

  if v_id is null then
    insert into public.providers (slug, business_name, contact_name, phone_e164, whatsapp_e164, areas, bio)
    values (
      private.unique_slug(p ->> 'business_name'),
      p ->> 'business_name',
      nullif(p ->> 'contact_name', ''),
      p ->> 'phone_e164',
      nullif(p ->> 'whatsapp_e164', ''),
      v_areas,
      nullif(p ->> 'bio', '')
    ) returning id into v_id;
  else
    update public.providers set
      business_name = p ->> 'business_name',
      contact_name = nullif(p ->> 'contact_name', ''),
      phone_e164 = p ->> 'phone_e164',
      whatsapp_e164 = nullif(p ->> 'whatsapp_e164', ''),
      areas = v_areas,
      bio = nullif(p ->> 'bio', '')
    where id = v_id;
    if not found then
      raise exception 'provider not found' using errcode = 'P0002';
    end if;
  end if;

  -- Replace the category set (only touch rows that change, so unchanged categories are not re-validated).
  if p ? 'category_ids' then
    v_cats := coalesce(array(select jsonb_array_elements_text(p -> 'category_ids')::uuid), '{}');
    delete from public.provider_categories
    where provider_id = v_id and category_id <> all (v_cats);
    insert into public.provider_categories (provider_id, category_id)
    select v_id, c from unnest(v_cats) c
    on conflict do nothing;
  end if;

  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (auth.uid(), 'upsert_provider', 'provider', v_id::text);
  return v_id;
end;
$$;

-- ---- admin_set_provider_status
create or replace function public.admin_set_provider_status(p_id uuid, p_status public.provider_status, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.provider_status;
  v_consent_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if p_status = 'consented' then
    raise exception 'consent is only recorded through the provider''s consent link' using errcode = 'check_violation';
  end if;
  if p_status = 'removed' and nullif(btrim(p_reason), '') is null then
    raise exception 'a reason is required to remove a provider' using errcode = 'check_violation';
  end if;
  select status, consent_at into v_status, v_consent_at from public.providers where id = p_id for update;
  if not found then
    raise exception 'provider not found' using errcode = 'P0002';
  end if;
  -- Ruling R12: live only from consented, or from paused after consent (never from invited or removed).
  if p_status = 'live' and not (v_status = 'consented' or (v_status = 'paused' and v_consent_at is not null)) then
    raise exception 'a provider can only go live from consented, or paused after consent' using errcode = 'check_violation';
  end if;
  update public.providers set status = p_status where id = p_id;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'set_provider_status', 'provider', p_id::text, nullif(concat_ws(': ', p_status::text, p_reason), ''));
end;
$$;

-- ---- admin_record_check
create or replace function public.admin_record_check(p_provider uuid, p_kind public.check_kind, p_reference text, p_expires_on date)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if p_kind in ('gas_safe', 'dvsa_adi', 'insurance') and p_expires_on is null then
    raise exception 'expiry required for %', p_kind using errcode = 'check_violation';
  end if;
  insert into public.provider_checks (provider_id, kind, reference, expires_on, checked_by)
  values (p_provider, p_kind, nullif(p_reference, ''), p_expires_on, auth.uid())
  returning id into v_id;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'record_check', 'provider', p_provider::text, p_kind::text);
  return v_id;
end;
$$;

-- ---- admin_new_consent_token
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
  set consent_token = gen_random_uuid(), consent_token_used_at = null
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

-- ---- admin reads (no audit: reads). Admin pages cannot select tables directly; these self-check.
create or replace function public.admin_list_providers() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'business_name', p.business_name, 'phone_e164', p.phone_e164,
      'status', p.status,
      'categories', coalesce((select jsonb_agg(c.name order by c.name) from public.provider_categories pc
                              join public.categories c on c.id = pc.category_id where pc.provider_id = p.id), '[]'::jsonb)
    ) order by p.created_at desc)
    from public.providers p
  ), '[]'::jsonb);
end;
$$;

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
    'status', p.status, 'consent_at', p.consent_at,
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
    'public.admin_upsert_provider(jsonb)',
    'public.admin_set_provider_status(uuid, public.provider_status, text)',
    'public.admin_record_check(uuid, public.check_kind, text, date)',
    'public.admin_new_consent_token(uuid)',
    'public.admin_list_providers()',
    'public.admin_get_provider(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---- consent flow (Task 8). Called by the consent page with the service key: the provider has no account.

-- What the consent page shows for a valid, unused token on an invited provider; zero rows otherwise.
create or replace function public.consent_preview(p_token uuid)
returns table (business_name text, categories text[], areas text[])
language sql stable security definer set search_path = ''
as $$
  select p.business_name,
         coalesce((select array_agg(c.name order by c.name) from public.provider_categories pc
                   join public.categories c on c.id = pc.category_id where pc.provider_id = p.id), '{}'::text[]),
         coalesce(p.areas, '{}'::text[])
  from public.providers p
  where p.consent_token = p_token and p.consent_token_used_at is null and p.status = 'invited';
$$;

-- Records consent only for a matching, unused token on an invited provider. Returns 'ok' or 'invalid'.
-- The evidence pins the exact statement shown (SHA-256 of the rendered text), who ran the service and the contact address.
drop function if exists public.accept_consent(uuid, text, text);
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
