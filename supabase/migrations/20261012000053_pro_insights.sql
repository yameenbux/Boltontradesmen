-- Pro insights, requested by the owner: page views for every trader, how many people looked for their trade (Pro),
-- and polite follow-ups on quotes nobody has answered (Pro).
--
-- * public.page_view_days: views per day of a trader's page ('profile', ref = provider id) and of a trade's page
--   ('category', ref = category slug). One view per viewer per page per Bolton day. A viewer is the same keyed hash of
--   the connection the enquiry counter uses (lib/device-hash.ts); public.page_view_seen keeps it for two days only, to
--   skip repeats, then it's deleted. The trader's own views and the admin's don't count, and nor do traders looking at
--   trade pages. Crawlers are turned away before this (app/api/view/route.ts).
-- * public.my_insights(p_provider): the listing's own page views (this month, last month, six months), and with Pro,
--   the last 30 days' demand for each of its trades: views of the trade's page and Ask Bolton questions in its areas.
-- * Quote follow-ups: a quote sent by email and not answered gets a friendly reminder 3 days after it was sent and a
--   second 7 days after, while it's still open and the listing has Pro. Email only, under the existing daily caps.
-- Re-runnable.

-- ---------------------------------------------------------------- page views
create table if not exists public.page_view_days (
  kind text not null check (kind in ('profile', 'category')),
  ref text not null check (char_length(ref) between 1 and 80),
  day date not null,
  views int not null default 0 check (views >= 0),
  primary key (kind, ref, day)
);
alter table public.page_view_days enable row level security;
revoke all on public.page_view_days from public, anon, authenticated, service_role;

create table if not exists public.page_view_seen (
  kind text not null,
  ref text not null,
  day date not null,
  viewer text not null,
  primary key (kind, ref, day, viewer)
);
create index if not exists page_view_seen_day on public.page_view_seen (day);
alter table public.page_view_seen enable row level security;
revoke all on public.page_view_seen from public, anon, authenticated, service_role;

-- Counts a view (service role, from the view beacon). p_ref: the trader's slug or the trade's slug. p_viewer: the
-- connection's keyed hash. p_actor: the signed-in viewer, if any. Returns whether it counted.
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

-- {views: {this_month, last_month, months: [{month 'YYYY-MM-01', views}] (six, oldest first)}, pro,
--  demand: null, or with Pro {days: 30, trades: [{slug, name, page_views, questions}]}}. The linked trader only.
create or replace function public.my_insights(p_provider uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id uuid := private.my_listing_id(p_provider);
  v_pro boolean := private.is_pro(p_provider);
  v_month date := date_trunc('month', private.london_today())::date;
  v_views jsonb;
  v_demand jsonb;
begin
  select jsonb_build_object(
    'this_month', coalesce((select sum(views) from public.page_view_days
                            where kind = 'profile' and ref = v_id::text and day >= v_month), 0),
    'last_month', coalesce((select sum(views) from public.page_view_days
                            where kind = 'profile' and ref = v_id::text
                              and day >= (v_month - interval '1 month')::date and day < v_month), 0),
    'months', (
      select jsonb_agg(jsonb_build_object('month', to_char(m.month, 'YYYY-MM-DD'), 'views', coalesce(
               (select sum(d.views) from public.page_view_days d
                where d.kind = 'profile' and d.ref = v_id::text
                  and d.day >= m.month and d.day < (m.month + interval '1 month')::date), 0)) order by m.month)
      from (select (v_month - make_interval(months => g))::date as month from generate_series(5, 0, -1) g) m)
  ) into v_views;

  if v_pro then
    select jsonb_build_object('days', 30, 'trades', coalesce(jsonb_agg(t order by t ->> 'name'), '[]'::jsonb))
    into v_demand
    from (
      select jsonb_build_object(
        'slug', c.slug,
        'name', c.name,
        'page_views', coalesce((select sum(d.views) from public.page_view_days d
                                where d.kind = 'category' and d.ref = c.slug
                                  and d.day > private.london_today() - 30), 0),
        'questions', (select count(*) from public.questions q
                      where q.category_id = c.id and q.status = 'published'
                        and q.district = any (p.areas)
                        and q.published_at > now() - interval '30 days')
      ) as t
      from public.providers p
      join public.provider_categories pc on pc.provider_id = p.id
      join public.categories c on c.id = pc.category_id
      where p.id = v_id and c.active
    ) x;
  end if;

  return jsonb_build_object('views', v_views, 'pro', v_pro, 'demand', v_demand);
end;
$$;
revoke execute on function public.my_insights(uuid) from public, anon;
grant execute on function public.my_insights(uuid) to authenticated;

-- Page views older than 13 months aren't needed for any report (the daily job calls this).
create or replace function public.purge_old_page_views() returns int
language sql security definer set search_path = ''
as $$
  with d as (delete from public.page_view_days where day < private.london_today() - 400 returning 1)
  select count(*)::int from d;
$$;
revoke execute on function public.purge_old_page_views() from public, anon, authenticated;
grant execute on function public.purge_old_page_views() to service_role;

-- ---------------------------------------------------------------- quote follow-ups
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'job_request', 'question', 'quote_answered', 'doc_email', 'review_request', 'payment_reminder_1', 'payment_reminder_2',
  'quote_followup_1', 'quote_followup_2'
));

-- Claims a message to the customer on a quote or invoice (as 000038), plus 'quote_followup_1' and '_2': a sent quote
-- not yet answered and still open, by email only.
create or replace function private.claim_customer_message(p_kind text, p_doc uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.trade_docs;
  v_out jsonb := '[]'::jsonb;
  v_ch text;
  v_to text;
  v_id uuid;
begin
  select * into v from public.trade_docs where id = p_doc;
  if v.id is null then
    return null;
  end if;
  if p_kind = 'review_request' and not (v.kind = 'invoice' and v.status = 'paid' and v.ask_review) then
    return null;
  end if;
  if p_kind like 'payment_reminder_%' and not (v.kind = 'invoice' and v.status = 'unpaid') then
    return null;
  end if;
  if p_kind like 'quote_followup_%' and not (v.kind = 'quote' and v.status = 'sent'
                                             and (v.until is null or v.until >= private.london_today())) then
    return null;
  end if;
  if p_kind = 'doc_email' and v.status = 'draft' then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('claim_alerts:' || v.provider_id::text));
  foreach v_ch in array array['sms', 'email'] loop
    v_to := case v_ch when 'sms' then case when v.customer_phone ~ '^\+447' then v.customer_phone end
                      else v.customer_email end;
    continue when v_to is null or (v_ch = 'sms' and (p_kind = 'doc_email' or p_kind like 'quote_followup_%'));
    continue when v_ch = 'sms' and (select count(*) from public.notifications n
                   where n.provider_id = v.provider_id and n.channel = 'sms'
                     and n.kind in ('review_request', 'payment_reminder_1', 'payment_reminder_2')
                     and n.created_at > now() - interval '24 hours') >= 20;
    -- At most 30 emails to customers a day per listing.
    continue when v_ch = 'email' and (select count(*) from public.notifications n
                   where n.provider_id = v.provider_id and n.channel = 'email'
                     and n.kind in ('review_request', 'payment_reminder_1', 'payment_reminder_2', 'doc_email',
                                    'quote_followup_1', 'quote_followup_2')
                     and n.created_at > now() - interval '24 hours') >= 30;
    continue when p_kind = 'review_request' and exists (
      select 1 from public.notifications n
      where n.provider_id = v.provider_id and n.kind = 'review_request' and n.to_addr = v_to
        and n.created_at > now() - interval '90 days');
    insert into public.notifications (provider_id, kind, ref_id, channel, to_addr)
    values (v.provider_id, p_kind, v.id, v_ch, v_to)
    on conflict (kind, ref_id, provider_id, channel) do nothing
    returning id into v_id;
    if v_id is not null then
      v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'provider_id', v.provider_id, 'channel', v_ch, 'to', v_to));
    end if;
    v_id := null;
  end loop;
  return jsonb_build_object('doc', private.doc_json(v),
                            'business_name', (select business_name from public.providers where id = v.provider_id),
                            'slug', (select slug from public.providers where id = v.provider_id and status = 'live'),
                            'send', v_out);
end;
$$;
revoke execute on function private.claim_customer_message(text, uuid) from public, anon, authenticated;

create or replace function public.claim_customer_message(p_kind text, p_doc uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if p_kind is null or p_kind not in ('review_request', 'payment_reminder_1', 'payment_reminder_2', 'doc_email',
                                      'quote_followup_1', 'quote_followup_2') then
    raise exception 'bad_kind';
  end if;
  return private.claim_customer_message(p_kind, p_doc);
end;
$$;
revoke execute on function public.claim_customer_message(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_customer_message(text, uuid) to service_role;

-- Quotes due a follow-up (service role, for the daily job): sent by a Pro listing to an email address in the last 3
-- weeks, not answered, still open; the first 3 days after sending, the second 7 days after. Returns [{id, kind}].
create or replace function public.due_quote_followups() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind)), '[]'::jsonb)
  from (
    select d.id,
           case when f1.id is null then 'quote_followup_1' else 'quote_followup_2' end as kind
    from public.trade_docs d
    left join public.notifications f1 on f1.ref_id = d.id and f1.kind = 'quote_followup_1'
    where d.kind = 'quote' and d.status = 'sent' and d.customer_email is not null
      and d.sent_at is not null and d.sent_at > now() - interval '21 days'
      and (d.until is null or d.until >= private.london_today())
      and private.is_pro(d.provider_id)
      and not exists (select 1 from public.notifications n where n.ref_id = d.id and n.kind = 'quote_followup_2')
      and ((f1.id is null and d.sent_at <= now() - interval '3 days')
           or (f1.id is not null and d.sent_at <= now() - interval '7 days'))
    limit 200
  ) x;
$$;
revoke execute on function public.due_quote_followups() from public, anon, authenticated;
grant execute on function public.due_quote_followups() to service_role;
