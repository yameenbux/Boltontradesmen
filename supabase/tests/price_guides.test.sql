-- Price guides (migration 000032): price_guide_public shows a trade only from 10 counted reviews (published or
-- under_check), with the right band counts, quote share and months; the threshold can be raised but never lowered;
-- anon reads the view and still can't read a review.
begin;
select plan(19);

select columns_are('public', 'price_guide_public', array[
  'category_slug', 'category_name', 'group_slug', 'group_name', 'review_count', 'band_under_250', 'band_250_1k',
  'band_1k_5k', 'band_over_5k', 'on_price_pct', 'earliest_job_month', 'latest_job_month'
], 'price_guide_public has only the totals (no provider, reviewer, district or comment)');
select is((select value from public.settings where key = 'price_guide_min_reviews'), '10'::jsonb,
  'the threshold setting is 10 (lib/price-guides.ts PRICE_GUIDE_MIN_REVIEWS)');

-- Twelve reviewers and three providers (one review per reviewer per provider).
insert into auth.users (id)
select ('00000000-0000-0000-0000-0000000f9a' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 12) n;
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence) values
  ('00000000-0000-0000-0000-0000000f9b01', 'pg-green-one', 'Green One', '+447700900971', 'live', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000f9b02', 'pg-green-two', 'Green Two', '+447700900972', 'paused', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000f9b03', 'pg-roof-one', 'Roof One', '+447700900973', 'live', now(), '{}'::jsonb);

create function pg_temp.review(p_provider int, p_reviewer int, p_cat text, p_month date, p_band text, p_on_price text,
  p_status text default 'published') returns void language sql as $$
  insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality,
    use_again, status, removal_reason)
  values (('00000000-0000-0000-0000-0000000f9b0' || p_provider)::uuid,
    ('00000000-0000-0000-0000-0000000f9a' || lpad(p_reviewer::text, 2, '0'))::uuid,
    (select id from public.categories where slug = p_cat), p_month, p_band::public.value_band, 'yes',
    p_on_price::public.on_price_answer, 4, 'yes', p_status::public.review_status,
    case when p_status = 'removed' then 'pgTAP' end)
$$;

-- Gardener: 9 counted (8 published, 1 under check), plus one each that never counts (held, under notice, removed).
select pg_temp.review(1, n, 'gardener', (date '2025-03-01' + (n || ' months')::interval)::date,
  case when n <= 4 then '<250' when n <= 8 then '250-1k' else '1k-5k' end,
  case when n <= 6 then 'yes' else 'slightly_over_explained' end)
from generate_series(1, 8) n;
select pg_temp.review(1, 9, 'gardener', date '2025-01-01', '5k+', 'significantly_over', 'under_check');
select pg_temp.review(1, 10, 'gardener', date '2025-06-01', '5k+', 'yes', 'pending');
select pg_temp.review(1, 11, 'gardener', date '2025-06-01', '5k+', 'yes', 'under_notice');
select pg_temp.review(1, 12, 'gardener', date '2025-06-01', '5k+', 'yes', 'removed');

select is((select count(*)::int from public.price_guide_public where category_slug = 'gardener'), 0,
  '9 counted reviews: no guide (held, under-notice and removed reviews do not count)');

-- The 10th counted review, of a paused listing (its reviews still count, as they do for scores).
select pg_temp.review(2, 1, 'gardener', date '2026-02-01', '<250', 'yes');

select is((select review_count from public.price_guide_public where category_slug = 'gardener'), 10,
  '10 counted reviews: the guide shows');
select is((select row(band_under_250, band_250_1k, band_1k_5k, band_over_5k)::text from public.price_guide_public
  where category_slug = 'gardener'), '(5,4,0,1)', 'band counts');
select is((select on_price_pct from public.price_guide_public where category_slug = 'gardener'), 70,
  '7 of 10 said the price matched the quote');
select is((select earliest_job_month from public.price_guide_public where category_slug = 'gardener'), date '2025-01-01',
  'earliest counted job month');
select is((select latest_job_month from public.price_guide_public where category_slug = 'gardener'), date '2026-02-01',
  'latest counted job month');
select is((select row(category_name, group_slug, group_name)::text from public.price_guide_public
  where category_slug = 'gardener'), '(Gardener,home-trades,"Home & trades")', 'trade name and group');

-- Rounding: a roofer guide from 11 reviews, 8 of them on price (72.7%, shown as 73).
select pg_temp.review(3, n, 'roofer', date '2026-05-01', '1k-5k', case when n <= 8 then 'yes' else 'significantly_over' end)
from generate_series(1, 11) n;
select is((select on_price_pct from public.price_guide_public where category_slug = 'roofer'), 73,
  'on-price share rounds to the nearest whole per cent');

-- Raising the threshold hides guides; a setting below 10 (or nonsense) still means 10.
update public.settings set value = '11'::jsonb where key = 'price_guide_min_reviews';
select is((select array_agg(category_slug order by category_slug) from public.price_guide_public), array['roofer'],
  'threshold raised to 11: only the 11-review trade shows');
update public.settings set value = '3'::jsonb where key = 'price_guide_min_reviews';
select is((select array_agg(category_slug order by category_slug) from public.price_guide_public), array['gardener', 'roofer'],
  'a setting below 10 still needs 10');
update public.settings set value = '"lots"'::jsonb where key = 'price_guide_min_reviews';
select is((select count(*)::int from public.price_guide_public), 2, 'an unreadable setting reads as 10');
update public.settings set value = '10'::jsonb where key = 'price_guide_min_reviews';

-- An inactive trade has no guide.
update public.categories set active = false where slug = 'roofer';
select is((select count(*)::int from public.price_guide_public where category_slug = 'roofer'), 0, 'inactive trade: no guide');
update public.categories set active = true where slug = 'roofer';

-- Removing a review takes the trade back under the threshold.
update public.reviews set status = 'removed', removal_reason = 'pgTAP'
where reviewer_id = '00000000-0000-0000-0000-0000000f9a01' and provider_id = '00000000-0000-0000-0000-0000000f9b02';
select is((select count(*)::int from public.price_guide_public where category_slug = 'gardener'), 0,
  'a removed review takes the trade back to 9: no guide');

-- The public reads the view, never the reviews.
set local role anon;
select is((select count(*)::int from public.price_guide_public), 1, 'anon reads price_guide_public');
select throws_ok('select * from public.reviews', '42501', null, 'anon cannot read reviews');
reset role;
set local role authenticated;
select is((select count(*)::int from public.price_guide_public), 1, 'authenticated reads price_guide_public');
select throws_ok('select * from public.reviews', '42501', null, 'authenticated cannot read reviews');
reset role;

select * from finish();
rollback;
