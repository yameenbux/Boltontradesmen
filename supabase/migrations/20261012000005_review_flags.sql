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
