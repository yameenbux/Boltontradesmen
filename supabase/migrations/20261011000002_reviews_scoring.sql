-- Reviews table and shrunk scoring.

create type public.review_status as enum ('published', 'under_check', 'under_notice', 'removed');
create type public.on_time_answer as enum ('yes', 'late_informed', 'no');
create type public.on_price_answer as enum ('yes', 'slightly_over_explained', 'significantly_over');
create type public.use_again_answer as enum ('yes', 'maybe', 'no');
create type public.value_band as enum ('<250', '250-1k', '1k-5k', '5k+');

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete restrict,
  reviewer_id uuid not null references auth.users (id) on delete restrict,
  category_id uuid not null references public.categories (id) on delete restrict,
  job_month date not null,
  value_band public.value_band not null,
  on_time public.on_time_answer not null,
  on_price public.on_price_answer not null,
  quality smallint not null check (quality between 1 and 5),
  tidy boolean,
  use_again public.use_again_answer not null,
  comment text check (char_length(comment) <= 400),
  status public.review_status not null default 'published',
  removal_reason text,
  device_hash text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint reviews_removed_requires_reason
    check (status <> 'removed' or removal_reason is not null)
);
create index reviews_provider_id_idx on public.reviews (provider_id, status);
create index reviews_reviewer_id_idx on public.reviews (reviewer_id);
create index reviews_category_id_idx on public.reviews (category_id);
create unique index one_live_review_per_reviewer
  on public.reviews (provider_id, reviewer_id) where status <> 'removed';

alter table public.reviews enable row level security;

-- Mean quality across every counted review (published or under_check) in the register.
create function public.register_mean_quality() returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select avg(r.quality)::numeric
  from public.reviews r
  where r.status in ('published', 'under_check');
$$;

-- Recency-weighted mean quality: weight = 0.5 ^ (age_in_months / 24).
create function public.weighted_mean_quality(p_provider uuid) returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select sum(r.quality * w.weight) / sum(w.weight)
  from public.reviews r
  cross join lateral (
    select power(
      0.5::numeric,
      greatest(0, extract(epoch from now() - r.job_month::timestamptz) / (86400 * 30.4375))::numeric / 24
    ) as weight
  ) w
  where r.provider_id = p_provider
    and r.status in ('published', 'under_check');
$$;

create function public.provider_stats(p_provider uuid)
returns table (
  review_count int,
  use_again_pct int,
  on_time_pct int,
  on_price_pct int,
  tidy_pct int,
  score numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with counted as (
    select * from public.reviews r
    where r.provider_id = p_provider and r.status in ('published', 'under_check')
  ),
  agg as (
    select
      count(*)::int as v,
      round(100.0 * count(*) filter (where use_again = 'yes') / nullif(count(*), 0))::int as use_again_pct,
      round(100.0 * count(*) filter (where on_time = 'yes') / nullif(count(*), 0))::int as on_time_pct,
      round(100.0 * count(*) filter (where on_price = 'yes') / nullif(count(*), 0))::int as on_price_pct,
      round(100.0 * count(*) filter (where tidy) / nullif(count(tidy), 0))::int as tidy_pct
    from counted
  )
  select
    agg.v,
    agg.use_again_pct,
    agg.on_time_pct,
    agg.on_price_pct,
    agg.tidy_pct,
    case when agg.v < 3 then null
         else (agg.v::numeric / (agg.v + 3)) * public.weighted_mean_quality(p_provider)
            + (3::numeric / (agg.v + 3)) * public.register_mean_quality()
    end
  from agg;
$$;

-- A category is visible when linked and, if it carries a legal requirement, an in-date matching check exists.
create function public.category_visible(p_provider uuid, p_category uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_categories pc
    join public.categories c on c.id = pc.category_id
    where pc.provider_id = p_provider
      and pc.category_id = p_category
      and (
        c.requirement = 'none'
        or exists (
          select 1 from public.provider_checks ck
          where ck.provider_id = p_provider
            and ck.kind::text = c.requirement::text
            and (ck.expires_on is null or ck.expires_on >= current_date)
        )
      )
  );
$$;
