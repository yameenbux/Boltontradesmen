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
