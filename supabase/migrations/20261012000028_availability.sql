-- "Taking on work": a trader's availability, a claim with a shelf life.
--
-- * public.providers gains availability ('taking' or 'booked', null when not set), available_until (a date) and
--   availability_set_at. 'booked' needs a date: "Booked up until 14 Nov". 'taking' may carry one too, the last day of
--   the week it was set in: "Taking on work this week".
-- * Nothing expires by a job. provider_public works out what still stands each time it is read:
--     'taking' shows for 14 days after it was set (and, "this week", not after that week);
--     'booked' shows until its date, then nothing.
--   It gains availability_status ('taking', 'booked' or null after expiry), availability_until and
--   availability_set_at (both null when nothing shows), appended last so `create or replace view` keeps the rest.
--   Availability is read by nothing that ranks or badges: provider_stats and the list order don't look at it.
-- * public.set_my_availability(p_status, p_until): the signed-in trader, for every live or paused listing linked to
--   their account (a person's availability is the same whichever listing). public.admin_set_availability(p_provider,
--   p_status, p_until): the admin, for any listing that isn't removed. A null status clears it. Both write an
--   audit_log row per listing.
-- * provider_my_reviews and admin_get_provider also return the stored values, for the trader's and the admin's forms.
-- Dates are Bolton's (Europe/London). Re-runnable.

alter table public.providers add column if not exists availability text;
alter table public.providers add column if not exists available_until date;
alter table public.providers add column if not exists availability_set_at timestamptz;

alter table public.providers drop constraint if exists providers_availability_check;
alter table public.providers add constraint providers_availability_check check (
  (availability is null and available_until is null and availability_set_at is null)
  or (availability = 'taking' and availability_set_at is not null)
  or (availability = 'booked' and available_until is not null and availability_set_at is not null)
);

-- ---------------------------------------------------------------- what still stands (used by the view)
-- 'taking', 'booked' or null: the stored claim after its shelf life.
create or replace function private.availability_now(p_status text, p_until date, p_set_at timestamptz) returns text
language sql stable set search_path = ''
as $$
  select case
    when p_status = 'taking' and p_set_at > now() - interval '14 days'
         and (p_until is null or p_until >= (now() at time zone 'Europe/London')::date) then 'taking'
    when p_status = 'booked' and p_until >= (now() at time zone 'Europe/London')::date then 'booked'
  end;
$$;
revoke execute on function private.availability_now(text, date, timestamptz) from public;
grant execute on function private.availability_now(text, date, timestamptz) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- provider_public (000006 body + availability)
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
  case when a.status is not null then p.availability_set_at end as availability_set_at
from public.providers p
cross join lateral private.provider_stats(p.id) s
cross join lateral (select private.availability_now(p.availability, p.available_until, p.availability_set_at) as status) a
where p.status = 'live';

alter view public.provider_public owner to postgres;
grant select on public.provider_public to anon, authenticated;

-- ---------------------------------------------------------------- setting it (shared by the trader and the admin)
-- Checks the claim and writes it to one listing, with an audit row. Raises bad_status, until_required,
-- until_not_future, until_too_far or not_this_week.
create or replace function private.write_availability(p_provider uuid, p_status text, p_until date, p_action text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
begin
  if v_status is null then
    update public.providers set availability = null, available_until = null, availability_set_at = null
    where id = p_provider;
  elsif v_status = 'taking' then
    -- "This week": the last day of the week it's set in, so from today to at most six days on.
    if p_until is not null and (p_until < v_today or p_until > v_today + 6) then
      raise exception 'not_this_week';
    end if;
    update public.providers set availability = 'taking', available_until = p_until, availability_set_at = now()
    where id = p_provider;
  elsif v_status = 'booked' then
    if p_until is null then
      raise exception 'until_required';
    end if;
    if p_until <= v_today then
      raise exception 'until_not_future';
    end if;
    if p_until > (v_today + interval '6 months')::date then
      raise exception 'until_too_far';
    end if;
    update public.providers set availability = 'booked', available_until = p_until, availability_set_at = now()
    where id = p_provider;
  else
    raise exception 'bad_status';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), p_action, 'provider', p_provider::text,
          case when v_status is null then 'cleared'
               when p_until is null then v_status
               else v_status || ' until ' || to_char(p_until, 'YYYY-MM-DD') end);
end;
$$;
revoke execute on function private.write_availability(uuid, text, date, text) from public, anon, authenticated;

-- The signed-in trader's own listings (live or paused). Returns their slugs, to refresh the public pages.
create or replace function public.set_my_availability(p_status text, p_until date) returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_slugs text[];
  v_id uuid;
begin
  select array_agg(id order by slug), array_agg(slug order by slug) into v_ids, v_slugs
  from public.providers
  where user_id = v_uid and v_uid is not null and status in ('live', 'paused');
  if v_ids is null then
    raise exception 'not_your_listing';
  end if;
  if exists (select 1 from public.profiles where user_id = v_uid and blocked_at is not null) then
    raise exception 'blocked';
  end if;
  foreach v_id in array v_ids loop
    perform private.write_availability(v_id, p_status, p_until, 'set_availability');
  end loop;
  return v_slugs;
end;
$$;

-- The admin, for any listing that isn't removed. Returns its slug.
create or replace function public.admin_set_availability(p_provider uuid, p_status text, p_until date) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.provider_status;
  v_slug text;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  select status, slug into v_status, v_slug from public.providers where id = p_provider for update;
  if not found then
    raise exception 'provider not found' using errcode = 'P0002';
  end if;
  if v_status = 'removed' then
    raise exception 'provider removed' using errcode = 'check_violation';
  end if;
  perform private.write_availability(p_provider, p_status, p_until, 'admin_set_availability');
  return v_slug;
end;
$$;

-- ---------------------------------------------------------------- the trader's own page (000009 body + availability)
create or replace function public.provider_my_reviews() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider', jsonb_build_object('id', p.id, 'slug', p.slug, 'business_name', p.business_name, 'status', p.status,
      'availability', jsonb_build_object('status', p.availability, 'until', p.available_until,
        'set_at', p.availability_set_at,
        'showing', private.availability_now(p.availability, p.available_until, p.availability_set_at))),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'created_at', r.created_at, 'job_month', r.job_month,
        'reviewer_name', coalesce(pr.display_name, 'Bolton resident'),
        'category_name', c.name, 'quality', r.quality, 'use_again', r.use_again, 'on_time', r.on_time,
        'on_price', r.on_price, 'tidy', r.tidy, 'value_band', r.value_band, 'comment', r.comment,
        'reply', case when rr.id is null then null else jsonb_build_object(
          'id', rr.id, 'body', rr.body, 'status', rr.status, 'created_at', rr.created_at,
          'editable_until', rr.created_at + interval '14 days') end
      ) order by r.created_at desc)
      from public.reviews r
      join public.categories c on c.id = r.category_id
      left join public.profiles pr on pr.user_id = r.reviewer_id
      left join public.review_responses rr on rr.review_id = r.id
      where r.provider_id = p.id and r.status in ('published', 'under_check') and pr.deleted_at is null
    ), '[]'::jsonb)
  ) order by p.business_name), '[]'::jsonb)
  from public.providers p
  where p.user_id = auth.uid() and p.status <> 'removed';
$$;

-- ---------------------------------------------------------------- admin_get_provider (000022 body + availability)
create or replace function public.admin_get_provider(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'business_name', p.business_name, 'contact_name', p.contact_name,
    'phone_e164', p.phone_e164, 'whatsapp_e164', p.whatsapp_e164, 'areas', p.areas, 'bio', p.bio,
    'status', p.status, 'consent_at', p.consent_at, 'consent_token_expires_at', p.consent_token_expires_at,
    'category_ids', coalesce((select jsonb_agg(pc.category_id) from public.provider_categories pc where pc.provider_id = p.id), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('id', ck.id, 'kind', ck.kind, 'reference', ck.reference,
                'expires_on', ck.expires_on, 'checked_at', ck.checked_at) order by ck.checked_at desc)
              from public.provider_checks ck where ck.provider_id = p.id), '[]'::jsonb),
    'linked', p.user_id is not null,
    'trader_link_expires_at', (
      select t.expires_at from public.trader_link_tokens t
      where t.provider_id = p.id and t.used_at is null and t.revoked_at is null and t.expires_at > now()
      order by t.created_at desc limit 1
    ),
    'availability', jsonb_build_object('status', p.availability, 'until', p.available_until,
      'set_at', p.availability_set_at,
      'showing', private.availability_now(p.availability, p.available_until, p.availability_set_at))
  ) into v
  from public.providers p where p.id = p_id;
  return v;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.set_my_availability(text, date)',
    'public.admin_set_availability(uuid, text, date)',
    'public.provider_my_reviews()',
    'public.admin_get_provider(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
