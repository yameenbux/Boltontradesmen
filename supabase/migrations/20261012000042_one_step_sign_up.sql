-- The sign-up in one step, as the owner asked: the trader ticks their trades (up to three) and the postcode areas
-- they cover, gives their mobile and WhatsApp numbers, and presses Confirm. Live at once; the admin checks afterwards.
--
-- * public.trader_publish_listing replaces 000041's: trades and areas are lists, and there's a WhatsApp number.
--   Pressing Confirm under the statement is the agreement (the evidence is recorded as before). A number already on
--   another listing answers 'duplicate' instead of failing. Trades that need a check first (Gas Safe, DVSA) still
--   wait for the admin, named in signup_trade.
-- Re-runnable.

drop function if exists public.trader_publish_listing(uuid, text, text, text, text, text, text, text, text, text, jsonb);

create or replace function public.trader_publish_listing(
  p_user_id uuid, p_business_name text, p_contact_name text, p_category_slugs text[], p_areas text[],
  p_phone_e164 text, p_whatsapp_e164 text, p_email text, p_plan text, p_ip_hash text, p_evidence jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_verdict text;
  v_id uuid;
  v_slug text;
  v_cats public.categories[];
  v_listed uuid[];
  v_waiting text;
  v_trades text;
  v_areas text[] := coalesce(array(select distinct upper(btrim(a)) from unnest(coalesce(p_areas, '{}')) a
                                   where nullif(btrim(a), '') is not null order by 1), '{}');
  v_whatsapp text := nullif(btrim(coalesce(p_whatsapp_e164, '')), '');
begin
  if p_user_id is null or not private.valid_consent_evidence(p_evidence) then
    return jsonb_build_object('result', 'invalid');
  end if;
  select coalesce(array_agg(c order by c.name), '{}') into v_cats
  from public.categories c where c.active and c.slug = any (coalesce(p_category_slugs, '{}'));
  if cardinality(v_cats) < 1 or cardinality(v_cats) > 3
     or cardinality(v_areas) < 1 or cardinality(v_areas) > 12
     or exists (select 1 from unnest(v_areas) a where a !~ '^[A-Z]{1,2}[0-9]{1,2}$')
     or (v_whatsapp is not null and v_whatsapp !~ '^\+44[0-9]{9,10}$') then
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
  -- One listing per account (a removed one doesn't count: they can list again), and per number (000034).
  if exists (select 1 from public.providers where user_id = p_user_id and status <> 'removed') then
    return jsonb_build_object('result', 'already');
  end if;
  if exists (select 1 from public.providers where status <> 'removed'
             and (phone_e164 in (p_phone_e164, v_whatsapp) or whatsapp_e164 in (p_phone_e164, v_whatsapp))) then
    return jsonb_build_object('result', 'duplicate');
  end if;

  v_trades := left(array_to_string(array(select (c).name from unnest(v_cats) c), ', '), 60);
  -- The request is kept as the record (and carries the limits: three a day per connection, two a week per number).
  v_verdict := public.submit_listing_request(p_business_name, p_contact_name, v_trades, v_areas[1], p_phone_e164,
                                             p_email, null, p_ip_hash, p_user_id, p_plan);
  if v_verdict <> 'ok' then
    return jsonb_build_object('result', v_verdict);
  end if;
  update public.listing_requests set status = 'done', handled_at = now()
  where user_id = p_user_id and status = 'new';

  v_waiting := nullif(left(array_to_string(array(select (c).name from unnest(v_cats) c
                                                 where (c).requirement in ('gas_safe', 'dvsa_adi')), ', '), 60), '');
  insert into public.providers (slug, business_name, contact_name, phone_e164, whatsapp_e164, areas, user_id, status,
                                consent_at, consent_evidence, consent_token_used_at, signup_trade, reviewed_at)
  values (private.unique_slug(btrim(p_business_name)), btrim(p_business_name), nullif(btrim(coalesce(p_contact_name, '')), ''),
          p_phone_e164, v_whatsapp, v_areas, p_user_id, 'live', now(),
          p_evidence || jsonb_build_object('via', 'sign_up', 'accepted_at', now()), now(), v_waiting, null)
  returning id, slug into v_id, v_slug;
  -- Trades that need a check first (Gas Safe, DVSA) wait for the admin; the rest are listed now.
  insert into public.provider_categories (provider_id, category_id)
  select v_id, (c).id from unnest(v_cats) c where (c).requirement not in ('gas_safe', 'dvsa_adi');
  update public.profiles set role = 'provider' where user_id = p_user_id and role = 'resident';

  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (p_user_id, 'trader_publish_listing', 'provider', v_id::text);
  return jsonb_build_object('result', 'ok', 'id', v_id, 'slug', v_slug);
end;
$$;
revoke execute on function public.trader_publish_listing(uuid, text, text, text[], text[], text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.trader_publish_listing(uuid, text, text, text[], text[], text, text, text, text, text, jsonb)
  to service_role;
