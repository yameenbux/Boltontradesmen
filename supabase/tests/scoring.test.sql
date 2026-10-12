begin;
select plan(18);

-- fixtures: providers A-D, reviewers, helper to add reviews
insert into public.providers (id, slug, business_name, phone_e164) values
  ('00000000-0000-0000-0000-0000000000b1', 'sc-a', 'Score A', '+447700900101'),
  ('00000000-0000-0000-0000-0000000000b2', 'sc-b', 'Score B', '+447700900102'),
  ('00000000-0000-0000-0000-0000000000b3', 'sc-c', 'Score C', '+447700900103'),
  ('00000000-0000-0000-0000-0000000000b4', 'sc-d', 'Score D', '+447700900104'),
  ('00000000-0000-0000-0000-0000000000b5', 'sc-e', 'Score E', '+447700900105');

insert into auth.users (id)
select ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 20) n;

create function pg_temp.add_review(
  p_provider text, p_reviewer int, p_quality int, p_age_months int default 0,
  p_status text default 'published', p_use_again text default 'yes',
  p_on_time text default 'yes', p_on_price text default 'yes', p_tidy boolean default null)
returns void language sql as $$
  insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band,
    on_time, on_price, quality, tidy, use_again, status, removal_reason)
  select ('00000000-0000-0000-0000-0000000000' || p_provider)::uuid,
    ('00000000-0000-0000-0000-0000000001' || lpad(p_reviewer::text, 2, '0'))::uuid,
    (select id from public.categories where slug = 'plumber'),
    (now() - make_interval(months => p_age_months))::date,
    '250-1k', p_on_time::public.on_time_answer, p_on_price::public.on_price_answer,
    p_quality, p_tidy, p_use_again::public.use_again_answer, p_status::public.review_status,
    case when p_status = 'removed' then 'test' end;
$$;

-- A: 2 reviews only -> no score
select pg_temp.add_review('b5', 1, 5);
select pg_temp.add_review('b5', 2, 5);
select is((select review_count from public.provider_stats('00000000-0000-0000-0000-0000000000b5')), 2, 'E review_count = 2');
select is((select score from public.provider_stats('00000000-0000-0000-0000-0000000000b5')), null, 'score NULL when count < 3');
select is((select tidy_pct from public.provider_stats('00000000-0000-0000-0000-0000000000b5')), null, 'tidy_pct NULL when no tidy answers');

-- Register: A 4x quality 5, B 4x quality 3, E 2x quality 5 would skew; remove E
-- (fixture tidy-up only: reviews_never_deleted forbids deletes, so lift it for this one statement)
alter table public.reviews disable trigger reviews_never_deleted;
delete from public.reviews where provider_id = '00000000-0000-0000-0000-0000000000b5';
alter table public.reviews enable trigger reviews_never_deleted;
select pg_temp.add_review('b1', n, 5) from generate_series(1, 4) n;
select pg_temp.add_review('b2', n, 3) from generate_series(1, 4) n;
select is(public.register_mean_quality(), 4.0::numeric, 'register mean = 4.0');
select is(round((select score from public.provider_stats('00000000-0000-0000-0000-0000000000b1')), 2), 4.57::numeric, 'A score 4.57');
select is(round((select score from public.provider_stats('00000000-0000-0000-0000-0000000000b2')), 2), 3.43::numeric, 'B score 3.43');

-- use_again_pct: 3 yes / 1 maybe = 75
select is((select use_again_pct from public.provider_stats('00000000-0000-0000-0000-0000000000b1')), 100, 'A use_again 100');
update public.reviews set use_again = 'maybe'
where id = (select id from public.reviews where provider_id = '00000000-0000-0000-0000-0000000000b1' limit 1);
select is((select use_again_pct from public.provider_stats('00000000-0000-0000-0000-0000000000b1')), 75, 'use_again 3 yes / 1 maybe = 75');
select is((select tidy_pct from public.provider_stats('00000000-0000-0000-0000-0000000000b1')), null, 'tidy_pct NULL when all tidy NULL');

-- Recency weighting: C = q5 @24mo, q1 @0, q3 @0
select pg_temp.add_review('b3', 5, 5, 24);
select pg_temp.add_review('b3', 6, 1, 0);
select pg_temp.add_review('b3', 7, 3, 0);
select is(round(public.weighted_mean_quality('00000000-0000-0000-0000-0000000000b3'), 1), 2.6::numeric, 'weighted mean with 24-month half weight = 2.6');

-- Status filtering: removed and under_notice excluded; under_check included
select pg_temp.add_review('b4', 8, 5, 0, 'removed');
select pg_temp.add_review('b4', 9, 5, 0, 'under_notice');
select pg_temp.add_review('b4', 10, 5, 0, 'under_check');
select is((select review_count from public.provider_stats('00000000-0000-0000-0000-0000000000b4')), 1, 'only under_check counted for D');

-- Percentages and tidy
select pg_temp.add_review('b4', 11, 4, 0, 'published', 'yes', 'late_informed', 'slightly_over_explained', true);
select pg_temp.add_review('b4', 12, 4, 0, 'published', 'no', 'no', 'yes', false);
select is((select on_time_pct from public.provider_stats('00000000-0000-0000-0000-0000000000b4')), 33, 'on_time_pct 1 of 3 yes = 33');
select is((select tidy_pct from public.provider_stats('00000000-0000-0000-0000-0000000000b4')), 50, 'tidy_pct over non-null only');

-- removed requires removal_reason
select throws_ok(
  $$insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, use_again, status)
    select '00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-000000000113',
    (select id from public.categories where slug = 'plumber'), current_date, '<250', 'yes', 'yes', 3, 'yes', 'removed'$$,
  '23514', null, 'removed review requires removal_reason');

-- Review Focus 5: expired Gas Safe hides gas-boilers only
insert into public.provider_checks (id, provider_id, kind, reference, expires_on)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b4', 'gas_safe', '999999', current_date + 30);
insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-0000000000b4', id from public.categories where slug in ('gas-boilers', 'handyman');
update public.provider_checks set expires_on = current_date - 1 where id = '00000000-0000-0000-0000-0000000000c1';
select is(public.category_visible('00000000-0000-0000-0000-0000000000b4',
  (select id from public.categories where slug = 'gas-boilers')), false, 'expired Gas Safe hides gas-boilers');
select is(public.category_visible('00000000-0000-0000-0000-0000000000b4',
  (select id from public.categories where slug = 'handyman')), true, 'handyman still visible');

-- Reviews are never hard-deleted: parents are restricted
select throws_ok(
  $$delete from public.providers where id = '00000000-0000-0000-0000-0000000000b4'$$,
  '23503', null, 'cannot delete a provider that has reviews');
select throws_ok(
  $$delete from auth.users where id = '00000000-0000-0000-0000-000000000110'$$,
  '23503', null, 'cannot delete a reviewer that has reviews');

select * from finish();
rollback;
