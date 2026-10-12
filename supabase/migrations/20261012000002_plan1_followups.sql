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
