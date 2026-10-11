-- Public view and row-level security lockdown: the anonymous read boundary.

-- Supabase grants ALL on new objects to anon/authenticated by default. Strip that,
-- so RLS-with-no-policies cannot silently pass as "empty" and future objects start closed.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- is_admin() is used by later RLS policies evaluated as authenticated.
grant execute on function public.is_admin() to authenticated;

-- Public catalogue policies (active rows only).
create policy categories_public_read on public.categories
  for select to anon, authenticated using (active);
create policy category_groups_public_read on public.category_groups
  for select to anon, authenticated using (true);

grant select on public.categories, public.category_groups to anon, authenticated;

-- Postgres checks EXECUTE on functions called by a view against the *invoking* role, not the
-- view owner. To let provider_public work for anon without exposing the public.* functions
-- directly, the view calls thin wrappers in a schema anon has no USAGE on (function EXECUTE is
-- checked by OID at run time; schema USAGE is only checked on name lookup).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.provider_stats(p_provider uuid)
returns table (review_count int, use_again_pct int, on_time_pct int, on_price_pct int, tidy_pct int, score numeric)
language sql stable security definer set search_path = ''
as $$ select * from public.provider_stats(p_provider); $$;

create or replace function private.category_visible(p_provider uuid, p_category uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select public.category_visible(p_provider, p_category); $$;

revoke execute on all functions in schema private from public;
grant execute on function private.provider_stats(uuid), private.category_visible(uuid, uuid) to anon, authenticated, service_role;

-- The only door to provider data. Runs with owner privileges (bypasses RLS) and exposes
-- no phone, billing, consent or document columns.
create view public.provider_public
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
  p.created_at
from public.providers p
cross join lateral private.provider_stats(p.id) s
where p.status = 'live';

alter view public.provider_public owner to postgres;
grant select on public.provider_public to anon, authenticated;
