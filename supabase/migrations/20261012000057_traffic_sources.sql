-- Where visitors and new traders come from, requested by the owner to see whether Facebook posts work:
--
-- * Arrivals (page_view_days kind 'arrival', ref 'fb' | 'ig' | 'wa'): people who landed on any page from Facebook,
--   Instagram or WhatsApp, one per connection a day like other page views. The browser works out the source from the
--   link (?ref=fb, ?utm_source=facebook, Facebook's own ?fbclid) or the page it came from (components/ArrivalBeacon.tsx);
--   nothing is stored in the browser. The admin's own visits don't count.
-- * providers.heard_from: what a new trader answered to "How did you hear about Bolton Vouched?" on the sign-up form
--   (optional), set once by the trader (set_my_heard_from).
-- * admin_signup_funnel gains arrivals {fb, ig, wa} and listed_from {<answer>: listings that went live}.
-- Re-runnable.

alter table public.page_view_days drop constraint if exists page_view_days_kind_check;
alter table public.page_view_days add constraint page_view_days_kind_check
  check (kind in ('profile', 'category', 'funnel', 'arrival'));

alter table public.providers add column if not exists heard_from text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'providers_heard_from_check') then
    alter table public.providers add constraint providers_heard_from_check check (heard_from in (
      'facebook', 'instagram', 'whatsapp', 'google', 'word_of_mouth', 'other'));
  end if;
end $$;

-- Counts a view (as 000056), plus arrivals from Facebook, Instagram and WhatsApp.
create or replace function public.record_page_view(p_kind text, p_ref text, p_viewer text, p_actor uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_ref text;
  v_owner uuid;
  v_day date := private.london_today();
begin
  if p_viewer is null or char_length(p_viewer) not between 16 and 128 then
    return false;
  end if;
  if p_actor is not null and exists (select 1 from public.profiles a where a.user_id = p_actor and a.role = 'admin') then
    return false;
  end if;
  if p_kind = 'profile' then
    select p.id::text, p.user_id into v_ref, v_owner from public.providers p where p.slug = p_ref and p.status = 'live';
    if v_ref is null or (p_actor is not null and p_actor = v_owner) then
      return false;
    end if;
  elsif p_kind = 'category' then
    select c.slug into v_ref from public.categories c where c.slug = p_ref and c.active;
    if v_ref is null or (p_actor is not null and exists (select 1 from public.providers p where p.user_id = p_actor)) then
      return false;
    end if;
  elsif p_kind = 'funnel' then
    if p_ref is null or p_ref not in ('for-traders', 'get-listed', 'trader-sign-in', 'trader-form') then
      return false;
    end if;
    v_ref := p_ref;
  elsif p_kind = 'arrival' then
    if p_ref is null or p_ref not in ('fb', 'ig', 'wa') then
      return false;
    end if;
    v_ref := p_ref;
  else
    return false;
  end if;
  delete from public.page_view_seen where day < v_day - 1;
  insert into public.page_view_seen (kind, ref, day, viewer) values (p_kind, v_ref, v_day, p_viewer)
  on conflict do nothing;
  if not found then
    return false;
  end if;
  insert into public.page_view_days (kind, ref, day, views) values (p_kind, v_ref, v_day, 1)
  on conflict (kind, ref, day) do update set views = public.page_view_days.views + 1;
  return true;
end;
$$;
revoke execute on function public.record_page_view(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_page_view(text, text, text, uuid) to service_role;

-- The trader's answer to "How did you hear about Bolton Vouched?", once (a later call changes nothing). The linked
-- trader only. Raises bad_source.
create or replace function public.set_my_heard_from(p_provider uuid, p_source text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := private.my_listing_id(p_provider);
begin
  if p_source is null or p_source not in ('facebook', 'instagram', 'whatsapp', 'google', 'word_of_mouth', 'other') then
    raise exception 'bad_source';
  end if;
  update public.providers set heard_from = p_source where id = v_id and heard_from is null;
end;
$$;
revoke execute on function public.set_my_heard_from(uuid, text) from public, anon;
grant execute on function public.set_my_heard_from(uuid, text) to authenticated;

-- The funnel for the last p_days days (as 000056), plus arrivals by source and new listings by what they answered.
create or replace function public.admin_signup_funnel(p_days int) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_from date := private.london_today() - (v_days - 1);
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'days', v_days,
    'steps', (
      select jsonb_object_agg(s.ref, coalesce((select sum(d.views) from public.page_view_days d
                                               where d.kind = 'funnel' and d.ref = s.ref and d.day >= v_from), 0))
      from unnest(array['for-traders', 'get-listed', 'trader-sign-in', 'trader-form']) s(ref)),
    'arrivals', (
      select jsonb_object_agg(s.ref, coalesce((select sum(d.views) from public.page_view_days d
                                               where d.kind = 'arrival' and d.ref = s.ref and d.day >= v_from), 0))
      from unnest(array['fb', 'ig', 'wa']) s(ref)),
    'listed', (select count(*) from public.providers p
               where (p.created_at at time zone 'Europe/London')::date >= v_from and p.user_id is not null),
    'listed_from', (
      select coalesce(jsonb_object_agg(x.src, x.n), '{}'::jsonb)
      from (select coalesce(p.heard_from, 'unknown') as src, count(*) as n from public.providers p
            where (p.created_at at time zone 'Europe/London')::date >= v_from and p.user_id is not null
            group by 1) x));
end;
$$;
revoke execute on function public.admin_signup_funnel(int) from public, anon;
grant execute on function public.admin_signup_funnel(int) to authenticated;
