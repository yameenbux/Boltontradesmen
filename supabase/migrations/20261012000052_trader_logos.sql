-- Trader logos and the Pro cover colour, requested by the owner: a trader can add their logo when they sign up (or
-- later, from the dashboard), and it shows on their page in place of their initials. Pro listings can also pick a
-- colour for a cover band at the top of their page. Neither changes ranking or scores.
--
-- * public 'trader-logos' bucket: the app's server re-encodes every logo (lib/trader-logo.ts) and uploads it with the
--   service role, to <provider id>/<random>.webp. Public read: the page shows it to everyone.
-- * providers.logo_path, providers.brand_color (one of a fixed set, so a page can't be given any colour).
-- * provider_public gains logo_path and brand_color (brand_color only while Pro is on).
-- * my_branding, set_my_logo (returns the old path so the app deletes the file), set_my_brand_color (Pro only).
-- Re-runnable.

-- ---------------------------------------------------------------- storage bucket (where Storage exists)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('trader-logos', 'trader-logos', true, 1048576, array['image/webp'])
    on conflict (id) do update set
      public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- ---------------------------------------------------------------- columns
alter table public.providers add column if not exists logo_path text;
alter table public.providers add column if not exists brand_color text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'providers_logo_path_check') then
    alter table public.providers add constraint providers_logo_path_check
      check (logo_path is null or (char_length(logo_path) <= 200 and logo_path like id::text || '/%' and logo_path not like '%..%'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'providers_brand_color_check') then
    alter table public.providers add constraint providers_brand_color_check
      check (brand_color is null or brand_color in ('brick', 'forest', 'teal', 'navy', 'plum', 'ochre', 'ink'));
  end if;
end $$;

-- ---------------------------------------------------------------- the public view (000035's, plus two columns)
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
  ) as verified_job_count,
  a.status as availability_status,
  case when a.status is not null then p.available_until end as availability_until,
  case when a.status is not null then p.availability_set_at end as availability_set_at,
  (pro.active and exists (
    select 1 from public.pro_documents d
    where d.provider_id = p.id and d.kind = 'photo_id' and d.status = 'approved'
  )) as id_checked,
  case when pro.active then coalesce((
    select jsonb_agg(jsonb_build_object('path', w.storage_path, 'width', w.width, 'height', w.height)
                     order by w.position, w.created_at)
    from public.work_photos w
    where w.provider_id = p.id and w.removed_at is null
  ), '[]'::jsonb) else '[]'::jsonb end as photos,
  pro.active as takes_requests,
  p.logo_path,
  case when pro.active then p.brand_color end as brand_color
from public.providers p
cross join lateral private.provider_stats(p.id) s
cross join lateral (select private.availability_now(p.availability, p.available_until, p.availability_set_at) as status) a
cross join lateral (select private.is_pro(p.id) as active) pro
where p.status = 'live';

alter view public.provider_public owner to postgres;
grant select on public.provider_public to anon, authenticated;

-- ---------------------------------------------------------------- the trader's own
-- The trader's logo and cover colour, for the dashboard (their own listing only). Not "stable": my_listing locks the
-- row, which a read-only call can't.
create or replace function public.my_branding(p_provider uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
begin
  v := private.my_listing(p_provider);
  return jsonb_build_object('logo_path', v.logo_path, 'brand_color', v.brand_color);
end;
$$;

-- Sets (a path the app stored at <provider id>/<file> in 'trader-logos') or clears (null) the logo. Returns the
-- previous path, so the app can delete that file. Raises bad_path or blocked.
create or replace function public.set_my_logo(p_provider uuid, p_path text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
begin
  v := private.my_pro_listing(p_provider, false);
  if p_path is not null and (left(p_path, 37) <> v.id::text || '/' or p_path like '%..%' or char_length(p_path) > 200
                             or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$') then
    raise exception 'bad_path';
  end if;
  update public.providers set logo_path = p_path, updated_at = now() where id = v.id;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), case when p_path is null then 'logo_removed' else 'logo_set' end, 'provider', v.id::text, p_path);
  return v.logo_path;
end;
$$;

-- The cover colour (Pro only; null takes it away). Raises not_pro, bad_color or blocked.
create or replace function public.set_my_brand_color(p_provider uuid, p_color text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
begin
  v := private.my_pro_listing(p_provider, p_color is not null);
  if p_color is not null and p_color not in ('brick', 'forest', 'teal', 'navy', 'plum', 'ochre', 'ink') then
    raise exception 'bad_color';
  end if;
  update public.providers set brand_color = p_color, updated_at = now() where id = v.id;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'brand_color_set', 'provider', v.id::text, p_color);
end;
$$;

revoke execute on function public.my_branding(uuid) from public, anon;
revoke execute on function public.set_my_logo(uuid, text) from public, anon;
revoke execute on function public.set_my_brand_color(uuid, text) from public, anon;
grant execute on function public.my_branding(uuid) to authenticated;
grant execute on function public.set_my_logo(uuid, text) to authenticated;
grant execute on function public.set_my_brand_color(uuid, text) to authenticated;
