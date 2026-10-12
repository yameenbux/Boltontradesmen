-- Public reviews (Plan 2, Task 8): a second read-only door, review_public, and provider_public gains
-- verified_job_count (appended last, so `create or replace view` keeps the existing columns).
-- Like provider_public, both views run with the owner's rights (postgres) and expose nothing private:
-- no reviewer id, device hash, removal reason or proof path; no phone numbers.

create or replace view public.provider_public
with (security_barrier = true) as
select
  p.id,
  p.slug,
  p.business_name,
  p.contact_name,
  p.areas,
  p.bio,
  (p.verified_at is not null) as is_verified,
  (p.whatsapp_e164 is not null) as has_whatsapp,
  coalesce((
    select array_agg(c.slug order by c.slug)
    from public.provider_categories pc
    join public.categories c on c.id = pc.category_id
    where pc.provider_id = p.id
      and c.active
      and private.category_visible(p.id, c.id)
  ), '{}'::text[]) as category_slugs,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'kind', ck.kind,
      'expires_on', ck.expires_on,
      'checked_at', ck.checked_at
    ) order by ck.checked_at, ck.kind)
    from public.provider_checks ck
    where ck.provider_id = p.id
      and (ck.expires_on is null or ck.expires_on >= current_date)
  ), '[]'::jsonb) as checks,
  s.review_count,
  s.use_again_pct,
  s.on_time_pct,
  s.on_price_pct,
  s.tidy_pct,
  s.score,
  (
    select max(r.created_at) from public.reviews r
    where r.provider_id = p.id and r.status in ('published', 'under_check')
  ) as last_review_at,
  p.created_at,
  (
    select count(*)::int from public.reviews r
    where r.provider_id = p.id and r.status in ('published', 'under_check')
      and exists (select 1 from public.review_proofs pr where pr.review_id = r.id and pr.outcome = 'accepted')
  ) as verified_job_count
from public.providers p
cross join lateral private.provider_stats(p.id) s
where p.status = 'live';

alter view public.provider_public owner to postgres;
grant select on public.provider_public to anon, authenticated;

-- Reviews that show publicly: live provider, status published or under_check (labelled), reviewer not deleted.
create or replace view public.review_public
with (security_barrier = true) as
select
  r.id,
  r.provider_id,
  p.slug as provider_slug,
  c.name as category_name,
  r.job_month,
  r.value_band,
  r.on_time,
  r.on_price,
  r.quality,
  r.tidy,
  r.use_again,
  r.comment,
  (r.status = 'under_check') as under_check,
  coalesce(pr.display_name, 'Bolton resident') as reviewer_name,
  coalesce(pr.group_member_at is not null, false) as group_member,
  exists (select 1 from public.review_proofs f where f.review_id = r.id and f.outcome = 'accepted') as verified_job,
  rr.body as reply_body,
  rr.created_at as reply_at,
  r.created_at,
  r.edited_at
from public.reviews r
join public.providers p on p.id = r.provider_id and p.status = 'live'
join public.categories c on c.id = r.category_id
left join public.profiles pr on pr.user_id = r.reviewer_id
left join public.review_responses rr on rr.review_id = r.id and rr.status = 'published'
where r.status in ('published', 'under_check')
  and pr.deleted_at is null;

alter view public.review_public owner to postgres;
revoke all on public.review_public from public, anon, authenticated;
grant select on public.review_public to anon, authenticated;
