-- Trader dashboard: enquiry counts, and the trader's own edits, pause and withdraw.
--
-- * Enquiries (spec 3, "Enquiry definition"): a call_tap or whatsapp_tap, at most one per (provider, actor-or-device,
--   Bolton calendar day), not counting taps by the listing's own linked account or by an admin. Each enquiry is put
--   down to the kind of its first tap that day, so calls + WhatsApps = enquiries. private.enquiries(p_provider) is
--   the one definition; public.enquiry_count (000004) now counts its rows, and private.enquiry_stats(p_provider) gives
--   this month, all time and the last six months (oldest first), plus the reviews posted this month.
--   Profile views are not recorded anywhere (the profile_view kind exists but nothing writes it), so none are counted.
-- * public.my_enquiry_stats(p_provider): the trader linked to that listing only (raises not_your_listing).
--   public.admin_enquiry_stats(p_provider): the admin, for any listing.
-- * public.update_my_listing(p_provider, p_bio, p_areas): the linked trader edits the bio (300 characters, no phone
--   numbers, no web or email addresses) and areas (postcode districts from lib/districts.ts, at least one).
--   Categories stay admin-only (a category can need a Gas Safe or DVSA check).
-- * public.pause_my_listing / unpause_my_listing / withdraw_my_listing(p_provider): live -> paused, paused -> live
--   (only when the trader paused it, never undoing the admin's pause), and live, paused or consented -> removed
--   ("Withdrawn by trader"). Removed is final as for the admin (000002's trigger): only a new invite brings it back.
--   providers.paused_by says who paused it ('trader' or 'admin'), set by a trigger on every status change.
-- * Every write is checked against the caller (the linked account), writes an audit_log row and returns the slug, so
--   the app refreshes that public page. provider_my_reviews also returns the bio, areas, categories and paused_by.
-- Re-runnable.

-- ---------------------------------------------------------------- enquiries: the one definition
create or replace function private.enquiries(p_provider uuid)
returns table (who text, day date, kind public.contact_type)
language sql stable security definer set search_path = ''
as $$
  select distinct on (coalesce(e.actor_id::text, e.device_hash), (e.created_at at time zone 'Europe/London')::date)
         coalesce(e.actor_id::text, e.device_hash),
         (e.created_at at time zone 'Europe/London')::date,
         e.type
  from public.contact_events e
  join public.providers p on p.id = e.provider_id
  where e.provider_id = p_provider
    and e.type in ('call_tap', 'whatsapp_tap')
    and (e.actor_id is null or (e.actor_id is distinct from p.user_id
         and not exists (select 1 from public.profiles a where a.user_id = e.actor_id and a.role = 'admin')))
  order by coalesce(e.actor_id::text, e.device_hash), (e.created_at at time zone 'Europe/London')::date,
           e.created_at, e.id;
$$;
revoke execute on function private.enquiries(uuid) from public, anon, authenticated;

create or replace function public.enquiry_count(p_provider uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from private.enquiries(p_provider);
$$;
revoke execute on function public.enquiry_count(uuid) from public, anon, authenticated;
grant execute on function public.enquiry_count(uuid) to service_role;

-- {this_month, all_time: {enquiries, calls, whatsapps}, months: [{month 'YYYY-MM-01', enquiries, calls, whatsapps}]
--  (six, oldest first, this month last), reviews_this_month}. Months are Bolton's.
create or replace function private.enquiry_stats(p_provider uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with e as (select * from private.enquiries(p_provider)),
  t as (select date_trunc('month', now() at time zone 'Europe/London')::date as m),
  months as (select (t.m - make_interval(months => g))::date as month from t, generate_series(5, 0, -1) g)
  select jsonb_build_object(
    'this_month', (
      select jsonb_build_object('enquiries', count(*), 'calls', count(*) filter (where e.kind = 'call_tap'),
                                'whatsapps', count(*) filter (where e.kind = 'whatsapp_tap'))
      from e, t where e.day >= t.m),
    'all_time', (
      select jsonb_build_object('enquiries', count(*), 'calls', count(*) filter (where e.kind = 'call_tap'),
                                'whatsapps', count(*) filter (where e.kind = 'whatsapp_tap'))
      from e),
    'months', (
      select jsonb_agg(jsonb_build_object('month', to_char(mo.month, 'YYYY-MM-DD'), 'enquiries', c.n,
                                          'calls', c.calls, 'whatsapps', c.whatsapps) order by mo.month)
      from months mo
      cross join lateral (
        select count(*) as n, count(*) filter (where e.kind = 'call_tap') as calls,
               count(*) filter (where e.kind = 'whatsapp_tap') as whatsapps
        from e where date_trunc('month', e.day)::date = mo.month
      ) c),
    'reviews_this_month', (
      select count(*) from public.reviews r, t
      where r.provider_id = p_provider and r.status in ('published', 'under_check')
        and (r.created_at at time zone 'Europe/London')::date >= t.m)
  );
$$;
revoke execute on function private.enquiry_stats(uuid) from public, anon, authenticated;

create or replace function public.my_enquiry_stats(p_provider uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.providers where id = p_provider and user_id = auth.uid() and status <> 'removed'
  ) then
    raise exception 'not_your_listing';
  end if;
  return private.enquiry_stats(p_provider);
end;
$$;

create or replace function public.admin_enquiry_stats(p_provider uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.providers where id = p_provider) then
    raise exception 'provider not found' using errcode = 'P0002';
  end if;
  return private.enquiry_stats(p_provider);
end;
$$;

-- ---------------------------------------------------------------- who paused it
alter table public.providers add column if not exists paused_by text;
alter table public.providers drop constraint if exists providers_paused_by_check;
alter table public.providers add constraint providers_paused_by_check check (
  (status = 'paused' and paused_by in ('trader', 'admin')) or (status <> 'paused' and paused_by is null)
) not valid;
-- Listings paused before this migration were paused by the admin.
update public.providers set paused_by = 'admin' where status = 'paused' and paused_by is null;
update public.providers set paused_by = null where status <> 'paused' and paused_by is not null;
alter table public.providers validate constraint providers_paused_by_check;

-- Every insert and status change sets it: 'trader' inside the trader's own functions (they set bv.trader_status for the
-- transaction), 'admin' for any other pause (admin_set_provider_status), null once it isn't paused.
create or replace function private.set_paused_by() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'paused' then
    new.paused_by := case when current_setting('bv.trader_status', true) = 'on' then 'trader' else 'admin' end;
  else
    new.paused_by := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.set_paused_by() from public, anon, authenticated;

drop trigger if exists providers_set_paused_by on public.providers;
create trigger providers_set_paused_by
  before insert or update of status on public.providers
  for each row execute function private.set_paused_by();

-- ---------------------------------------------------------------- the trader's own listing
-- Locks and returns the caller's listing (not removed), or raises not_your_listing.
create or replace function private.my_listing(p_provider uuid) returns public.providers
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
begin
  select * into v from public.providers
  where id = p_provider and user_id = auth.uid() and auth.uid() is not null and status <> 'removed'
  for update;
  if v.id is null then
    raise exception 'not_your_listing';
  end if;
  return v;
end;
$$;
revoke execute on function private.my_listing(uuid) from public, anon, authenticated;

-- The areas a trader can pick (lib/districts.ts BL_DISTRICTS), in that order.
create or replace function private.trader_districts() returns text[]
language sql immutable set search_path = ''
as $$
  select array['BL1', 'BL2', 'BL3', 'BL4', 'BL5', 'BL6', 'BL7', 'M26', 'M28', 'M46', 'WN2'];
$$;
grant execute on function private.trader_districts() to authenticated, service_role;

-- Raises bio_too_long, bio_has_phone, bio_has_link, areas_required, bad_area, blocked or not_your_listing.
create or replace function public.update_my_listing(p_provider uuid, p_bio text, p_areas text[]) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
  v_bio text := nullif(btrim(coalesce(p_bio, '')), '');
  v_in text[] := coalesce((select array_agg(upper(btrim(a))) from unnest(p_areas) a where btrim(a) <> ''), '{}');
  v_areas text[];
  v_changed text[] := '{}';
begin
  v := private.my_listing(p_provider);
  if exists (select 1 from public.profiles where user_id = auth.uid() and blocked_at is not null) then
    raise exception 'blocked';
  end if;
  if char_length(v_bio) > 300 then
    raise exception 'bio_too_long';
  end if;
  -- Ten or more digits, however they are spaced or punctuated, is a phone number (as for reviews and replies).
  if v_bio ~ '([0-9][ ().-]*){10,}' then
    raise exception 'bio_has_phone';
  end if;
  -- Web and email addresses (lib/listing-edit.ts LINK_IN_TEXT): customers get in touch through the page.
  if v_bio ~* '(https?://|www\.|@|[a-z0-9-]\.(co\.uk|org\.uk|com|uk|net|org|info|biz|io|me)\y)' then
    raise exception 'bio_has_link';
  end if;
  if cardinality(v_in) = 0 then
    raise exception 'areas_required';
  end if;
  if not (v_in <@ private.trader_districts()) then
    raise exception 'bad_area';
  end if;
  select array_agg(d order by i) into v_areas
  from unnest(private.trader_districts()) with ordinality u(d, i) where d = any (v_in);

  if v.bio is distinct from v_bio then v_changed := v_changed || 'bio'::text; end if;
  if v.areas is distinct from v_areas then v_changed := v_changed || 'areas'::text; end if;
  update public.providers set bio = v_bio, areas = v_areas where id = v.id;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'trader_edit_listing', 'provider', v.id::text,
          coalesce(nullif(array_to_string(v_changed, ', '), ''), 'no change'));
  return v.slug;
end;
$$;

-- Writes the status as the trader, with the same audit row as the admin's status change.
create or replace function private.trader_set_status(p_provider uuid, p_status public.provider_status, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform set_config('bv.trader_status', 'on', true);
  update public.providers set status = p_status where id = p_provider;
  perform set_config('bv.trader_status', '', true);
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'set_provider_status', 'provider', p_provider::text, p_status::text || ': ' || p_reason);
end;
$$;
revoke execute on function private.trader_set_status(uuid, public.provider_status, text) from public, anon, authenticated;

-- live -> paused. Raises not_live.
create or replace function public.pause_my_listing(p_provider uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
begin
  v := private.my_listing(p_provider);
  if v.status <> 'live' then
    raise exception 'not_live';
  end if;
  perform private.trader_set_status(v.id, 'paused', 'Paused by trader');
  return v.slug;
end;
$$;

-- paused -> live, only when the trader paused it. Raises not_paused or paused_by_admin.
create or replace function public.unpause_my_listing(p_provider uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
begin
  v := private.my_listing(p_provider);
  if v.status <> 'paused' then
    raise exception 'not_paused';
  end if;
  if v.paused_by is distinct from 'trader' or v.consent_at is null then
    raise exception 'paused_by_admin';
  end if;
  perform private.trader_set_status(v.id, 'live', 'Unpaused by trader');
  return v.slug;
end;
$$;

-- live, paused or consented -> removed, as the admin's removal. Only a new invite brings it back.
create or replace function public.withdraw_my_listing(p_provider uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
begin
  v := private.my_listing(p_provider);
  if v.status not in ('live', 'paused', 'consented') then
    raise exception 'not_withdrawable';
  end if;
  perform private.trader_set_status(v.id, 'removed', 'Withdrawn by trader');
  return v.slug;
end;
$$;

-- ---------------------------------------------------------------- the trader's own page (000028 body + listing)
create or replace function public.provider_my_reviews() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider', jsonb_build_object('id', p.id, 'slug', p.slug, 'business_name', p.business_name, 'status', p.status,
      'availability', jsonb_build_object('status', p.availability, 'until', p.available_until,
        'set_at', p.availability_set_at,
        'showing', private.availability_now(p.availability, p.available_until, p.availability_set_at)),
      'bio', p.bio, 'areas', to_jsonb(coalesce(p.areas, '{}'::text[])), 'paused_by', p.paused_by,
      'categories', coalesce((
        select jsonb_agg(c.name order by c.name)
        from public.provider_categories pc join public.categories c on c.id = pc.category_id
        where pc.provider_id = p.id
      ), '[]'::jsonb)),
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

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.my_enquiry_stats(uuid)',
    'public.admin_enquiry_stats(uuid)',
    'public.update_my_listing(uuid, text, text[])',
    'public.pause_my_listing(uuid)',
    'public.unpause_my_listing(uuid)',
    'public.withdraw_my_listing(uuid)',
    'public.provider_my_reviews()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
