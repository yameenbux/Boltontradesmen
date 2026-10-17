-- "Manage your listing" straight after consent. When a trader agrees to be listed, the consent page offers a button
-- that signs them in and links the listing to their account, so the admin no longer has to send a second link.
-- public.consent_trader_link(consent token) makes the same single-use trader link the admin can make
-- (trader_link_tokens: 14 days, only the hash stored, a new one revokes any unused one), but only:
--   * for the listing whose consent link it is, and only once that consent has been given;
--   * within 30 minutes of the consent (the person on the "You're all set" page);
--   * while the listing isn't already linked to an account.
-- Server-side only (service role), called by the consent action right after accept_consent says 'ok'.

create or replace function public.consent_trader_link(p_consent_token uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_user uuid;
  v_token uuid := gen_random_uuid();
  v_expires timestamptz;
begin
  select id, user_id into v_id, v_user
  from public.providers
  where consent_token = p_consent_token
    and consent_token_used_at is not null
    and consent_token_used_at > now() - interval '30 minutes'
    and status in ('consented', 'live', 'paused')
  for update;
  if v_id is null or v_user is not null then
    return jsonb_build_object('state', 'unavailable');
  end if;
  update public.trader_link_tokens set revoked_at = now()
  where provider_id = v_id and used_at is null and revoked_at is null;
  insert into public.trader_link_tokens (provider_id, token_hash, created_by)
  values (v_id, private.trader_link_hash(v_token), null)
  returning expires_at into v_expires;
  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (null, 'consent_trader_link', 'provider', v_id::text);
  return jsonb_build_object('state', 'ok', 'token', v_token, 'expires_at', v_expires);
end;
$$;
revoke execute on function public.consent_trader_link(uuid) from public, anon, authenticated;
grant execute on function public.consent_trader_link(uuid) to service_role;
