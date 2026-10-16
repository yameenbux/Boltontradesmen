-- Bolton price guides (Step 7): "How much does a man and van cost in Bolton?", built only from what reviewers said.
--
-- * Every review already records the job's total in one of four bands (value_band) and whether the final price matched
--   the quote (on_price). public.price_guide_public adds them up per trade, over the same counted set as the scores
--   (status published or under_check; pending, under_notice and removed reviews never count).
-- * A trade shows only once it has settings.price_guide_min_reviews counted reviews (10; never fewer, whatever the
--   setting says), so no guide can point back at one person's job. No breakdown by district or provider, no prices,
--   no averages: only the count in each band, the share who said the price matched the quote, and the first and last
--   job month. lib/price-guides.ts PRICE_GUIDE_MIN_REVIEWS is the same number (tests/unit/price-guides.test.ts).
-- * Read-only and public (anon and authenticated may select); the view runs as its owner, so nobody needs, or gets,
--   access to the reviews themselves.
-- Re-runnable.

insert into public.settings (key, value) values ('price_guide_min_reviews', '10'::jsonb)
on conflict (key) do nothing;

-- The threshold: the setting, but never below 10 (a bad or missing value reads as 10).
create or replace function private.price_guide_min_reviews() returns int
language plpgsql stable security definer set search_path = ''
as $$
declare
  v int;
begin
  begin
    select (s.value #>> '{}')::int into v from public.settings s where s.key = 'price_guide_min_reviews';
  exception when others then
    v := null;
  end;
  return greatest(10, coalesce(v, 10));
end $$;
revoke all on function private.price_guide_min_reviews() from public;
grant execute on function private.price_guide_min_reviews() to anon, authenticated, service_role;

drop view if exists public.price_guide_public;
create view public.price_guide_public
with (security_barrier = true) as
with agg as (
  select
    r.category_id,
    count(*)::int as review_count,
    count(*) filter (where r.value_band = '<250')::int as band_under_250,
    count(*) filter (where r.value_band = '250-1k')::int as band_250_1k,
    count(*) filter (where r.value_band = '1k-5k')::int as band_1k_5k,
    count(*) filter (where r.value_band = '5k+')::int as band_over_5k,
    round(100.0 * count(*) filter (where r.on_price = 'yes') / count(*))::int as on_price_pct,
    min(r.job_month) as earliest_job_month,
    max(r.job_month) as latest_job_month
  from public.reviews r
  where r.status in ('published', 'under_check')
  group by r.category_id
)
select
  c.slug as category_slug,
  c.name as category_name,
  g.slug as group_slug,
  g.name as group_name,
  a.review_count,
  a.band_under_250,
  a.band_250_1k,
  a.band_1k_5k,
  a.band_over_5k,
  a.on_price_pct,
  a.earliest_job_month,
  a.latest_job_month
from agg a
join public.categories c on c.id = a.category_id
join public.category_groups g on g.id = c.group_id
where c.active
  and a.review_count >= private.price_guide_min_reviews();

alter view public.price_guide_public owner to postgres;
revoke all on public.price_guide_public from public, anon, authenticated;
grant select on public.price_guide_public to anon, authenticated;
