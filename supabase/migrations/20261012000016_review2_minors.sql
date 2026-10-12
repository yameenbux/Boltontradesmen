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
