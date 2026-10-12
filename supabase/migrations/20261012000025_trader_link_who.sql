-- Plan 2b final review M2: a trader sign-in link can't be claimed by the admin or by a blocked account. Before, once
-- the admin's profile had a display name, opening a forwarded link would link the listing to the admin (replies then
-- fail, and the real trader is locked out until an unlink). New state 'account_not_allowed', checked only for a
-- signed-in caller (a signed-out preview still shows the link's own state). Same signature. Re-runnable.
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
  if p_uid is not null and (
       coalesce(private.sign_in_kind(p_uid), '') not in ('google', 'email', 'phone')
       or exists (select 1 from public.profiles where user_id = p_uid and blocked_at is not null)
     ) then
    return 'account_not_allowed';
  end if;
  if exists (select 1 from public.providers p where p.user_id = p_uid and p.status <> 'removed') then
    return 'account_already_linked';
  end if;
  return 'ok';
end;
$$;
revoke execute on function private.trader_link_state(uuid, uuid) from public, anon, authenticated;
