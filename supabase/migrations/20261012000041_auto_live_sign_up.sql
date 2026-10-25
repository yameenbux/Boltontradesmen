-- A trader who signs themselves up goes live straight away. The owner asked for it: no consent link, no approval
-- step. The trader's own form is the consent: it shows the same statement as the consent page and they tick that
-- they agree, so the evidence (IP, text version, hash of the statement, operator and contact) is recorded the same way.
-- The admin reviews afterwards: new listings sit at the top of Providers marked "New, check me" until the admin
-- presses Checked, and can edit anything in the meantime (edits are audit-logged, the trader isn't told).
--
-- * providers.reviewed_at: when the admin checked the listing (null = not yet, only ever a sign-up). Listings that
--   exist already, and ones the admin makes, count as checked. providers.signup_trade: the trade the trader typed, kept for the admin when it didn't match a
--   category, or matched one that needs a check first (Gas Safe, DVSA): those go live with no category until the
--   admin has recorded the check and added it.
-- * public.trader_publish_listing(...): the sign-up. Same checks and limits as submit_listing_request (it calls it,
--   so the request is kept as the record), then the live listing, linked to the account. Service role only: the app
--   passes the signed-in account and the evidence it worked out.
-- * public.trader_agree_listing(user, provider, evidence): a listing linked to the account but not yet agreed to
--   (status invited) goes live when its owner ticks the same statement on their listing page. For listings the admin
--   made from a request, so the trader needs no consent link.
-- * public.admin_mark_provider_reviewed(id); admin_list_providers and admin_get_provider add reviewed_at,
--   signup_trade, created_at and (get only) the linked account's email, for telling a trader their number changed,
--   and whether a consent link was made before (a new one cancels it, so the admin is asked first).
-- Re-runnable.

-- Defaults to now: listings that exist already, and ones the admin makes, count as checked. Only a sign-up leaves it
-- empty.
alter table public.providers add column if not exists reviewed_at timestamptz default now();
alter table public.providers add column if not exists signup_trade text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'providers_signup_trade_length') then
    alter table public.providers add constraint providers_signup_trade_length check (char_length(signup_trade) <= 60);
  end if;
end;
$$;

-- The consent evidence a sign-up or an in-app agreement must carry (the same keys accept_consent stores).
create or replace function private.valid_consent_evidence(p jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select p is not null and jsonb_typeof(p) = 'object'
     and coalesce(p ->> 'text_version', '') <> ''
     and coalesce(p ->> 'text_sha256', '') ~ '^[0-9a-f]{64}$'
     and coalesce(p ->> 'owner_legal_name', '') <> ''
     and coalesce(p ->> 'contact_email', '') <> ''
$$;
revoke execute on function private.valid_consent_evidence(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- sign-up goes live
create or replace function public.trader_publish_listing(
  p_user_id uuid, p_business_name text, p_contact_name text, p_trade text, p_category_slug text, p_area text,
  p_phone_e164 text, p_email text, p_plan text, p_ip_hash text, p_evidence jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_verdict text;
  v_cat public.categories;
  v_id uuid;
  v_slug text;
  v_area text := nullif(btrim(coalesce(p_area, '')), '');
  v_trade text := nullif(btrim(coalesce(p_trade, '')), '');
begin
  if p_user_id is null or not private.valid_consent_evidence(p_evidence) then
    return jsonb_build_object('result', 'invalid');
  end if;
  -- The same account checks as the admin's approval (000038): a live account with a normal sign-in, not blocked,
  -- not the admin.
  if not exists (select 1 from auth.users where id = p_user_id and deleted_at is null)
     or not exists (select 1 from public.profiles where user_id = p_user_id and deleted_at is null)
     or coalesce(private.sign_in_kind(p_user_id), '') not in ('google', 'email', 'phone')
     or exists (select 1 from public.profiles where user_id = p_user_id and (blocked_at is not null or role = 'admin')) then
    return jsonb_build_object('result', 'not_allowed');
  end if;
  -- One listing per account (a removed one doesn't count: they can list again).
  if exists (select 1 from public.providers where user_id = p_user_id and status <> 'removed') then
    return jsonb_build_object('result', 'already');
  end if;

  v_verdict := public.submit_listing_request(p_business_name, p_contact_name, p_trade, p_area, p_phone_e164, p_email,
                                             null, p_ip_hash, p_user_id, p_plan);
  if v_verdict <> 'ok' then
    return jsonb_build_object('result', v_verdict);
  end if;
  update public.listing_requests set status = 'done', handled_at = now()
  where user_id = p_user_id and status = 'new';

  select * into v_cat from public.categories where slug = p_category_slug and active;
  insert into public.providers (slug, business_name, contact_name, phone_e164, areas, user_id, status,
                                consent_at, consent_evidence, consent_token_used_at, signup_trade, reviewed_at)
  values (private.unique_slug(btrim(p_business_name)), btrim(p_business_name), nullif(btrim(coalesce(p_contact_name, '')), ''),
          p_phone_e164, case when v_area ~ '^[A-Z]{1,2}[0-9]{1,2}$' then array[v_area] else '{}'::text[] end, p_user_id,
          'live', now(), p_evidence || jsonb_build_object('via', 'sign_up', 'accepted_at', now()), now(),
          case when v_cat.id is null or v_cat.requirement in ('gas_safe', 'dvsa_adi') then v_trade end, null)
  returning id, slug into v_id, v_slug;
  -- Trades that need a check first (Gas Safe, DVSA) wait for the admin; the rest are listed under their trade now.
  if v_cat.id is not null and v_cat.requirement not in ('gas_safe', 'dvsa_adi') then
    insert into public.provider_categories (provider_id, category_id) values (v_id, v_cat.id);
  end if;
  update public.profiles set role = 'provider' where user_id = p_user_id and role = 'resident';

  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (p_user_id, 'trader_publish_listing', 'provider', v_id::text);
  return jsonb_build_object('result', 'ok', 'id', v_id, 'slug', v_slug);
end;
$$;
revoke execute on function public.trader_publish_listing(uuid, text, text, text, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.trader_publish_listing(uuid, text, text, text, text, text, text, text, text, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------- agreeing on the listing page
create or replace function public.trader_agree_listing(p_user_id uuid, p_provider uuid, p_evidence jsonb) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or not private.valid_consent_evidence(p_evidence) then
    return 'invalid';
  end if;
  update public.providers
  set status = 'live',
      consent_at = now(),
      consent_evidence = p_evidence || jsonb_build_object('via', 'listing_page', 'accepted_at', now()),
      consent_token_used_at = coalesce(consent_token_used_at, now())
  where id = p_provider and user_id = p_user_id and status = 'invited'
  returning id into v_id;
  if v_id is null then
    return 'invalid';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (p_user_id, 'trader_agree_listing', 'provider', v_id::text);
  return 'ok';
end;
$$;
revoke execute on function public.trader_agree_listing(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.trader_agree_listing(uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------- admin
create or replace function public.admin_mark_provider_reviewed(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  update public.providers set reviewed_at = now() where id = p_id;
  if not found then
    raise exception 'provider not found' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (auth.uid(), 'mark_provider_reviewed', 'provider', p_id::text);
end;
$$;
revoke execute on function public.admin_mark_provider_reviewed(uuid) from public, anon;
grant execute on function public.admin_mark_provider_reviewed(uuid) to authenticated;

-- 000005 body, plus the review state; listings not yet checked come first.
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
      'status', p.status, 'reviewed_at', p.reviewed_at, 'signup_trade', p.signup_trade, 'created_at', p.created_at,
      'categories', coalesce((select jsonb_agg(c.name order by c.name) from public.provider_categories pc
                              join public.categories c on c.id = pc.category_id where pc.provider_id = p.id), '[]'::jsonb)
    ) order by (p.reviewed_at is null and p.status <> 'removed') desc, p.created_at desc)
    from public.providers p
  ), '[]'::jsonb);
end;
$$;

-- 000028 body, plus the review state and the linked account's email.
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
    'owner_email', (select u.email from auth.users u where u.id = p.user_id),
    'trader_link_expires_at', (
      select t.expires_at from public.trader_link_tokens t
      where t.provider_id = p.id and t.used_at is null and t.revoked_at is null and t.expires_at > now()
      order by t.created_at desc limit 1
    ),
    'availability', jsonb_build_object('status', p.availability, 'until', p.available_until,
      'set_at', p.availability_set_at,
      'showing', private.availability_now(p.availability, p.available_until, p.availability_set_at)),
    'reviewed_at', p.reviewed_at, 'signup_trade', p.signup_trade, 'created_at', p.created_at,
    -- Whether a consent link was made before: a new one cancels it, so the admin is asked first.
    'consent_link_made', exists (select 1 from public.audit_log a where a.target_type = 'provider'
                                 and a.target_id = p.id::text and a.action = 'new_consent_token')
  ) into v
  from public.providers p where p.id = p_id;
  return v;
end;
$$;
