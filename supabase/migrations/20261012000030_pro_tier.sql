-- Pro: the optional paid tier for traders (£10 a month or £100 a year, through Stripe Checkout).
--
-- Pro includes an ID check (shown publicly as "ID checked" once the admin approves the trader's photo ID), up to 6
-- work photos on the public profile, and a monthly enquiry report on the dashboard. It never changes ranking, badges
-- or list order: provider_stats and lib/directory.ts don't read anything here. The word "Pro" is never public:
-- provider_public only gains id_checked and photos, and both are empty unless Pro is on.
--
-- * public.subscriptions: Stripe's subscriptions, written only by the webhook and the reconciliation script (service
--   role functions below). One row per Stripe subscription; a trader who cancels and comes back gets a second row.
--   No anon, authenticated or service role table access: everything goes through functions.
-- * public.stripe_events: webhook event ids already handled, so a redelivered event changes nothing. Kept 90 days.
-- * private.is_pro(p_provider): status active or trialing, or past_due for up to 14 days after the paid period ended
--   (Stripe's Smart Retries run for about two weeks). Cancelling keeps Pro to the end of the paid period: Stripe keeps
--   the status active until then.
-- * public.pro_documents: the trader's photo ID (required) and optional insurance or accreditation documents, in the
--   private 'pro-id' bucket. The admin approves or rejects each (rejecting needs a reason; a rejected photo ID means a
--   full refund, made by hand in Stripe). Files are deleted 30 days after the decision (pro_id_files_due and
--   mark_pro_id_files_deleted, from the admin's Pro page); the decision is kept. Insurance and accreditations are
--   recorded as checks by the admin in the usual way (admin_record_check), with their expiry dates.
-- * public.work_photos: up to 6 photos in the public 'work-photos' bucket (re-encoded without metadata by the app).
--   Added and reordered only while Pro is on; removable at any time. Removed rows keep removed_at; the app deletes
--   the file.
-- * provider_public gains id_checked (an approved photo ID, while Pro is on) and photos ([{path, width, height}],
--   while Pro is on), appended last. When Pro lapses both disappear; the listing and its reviews stay.
-- * Every admin decision, trader upload and Stripe status change writes an audit_log row.
-- Re-runnable.

-- ---------------------------------------------------------------- storage buckets (where Storage exists)
-- The local stack has no storage schema (scripts/local-stack/proxy.mjs stands in for it), so only where it exists.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('pro-id', 'pro-id', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do update set
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
    -- Public read: the profile shows the photos to everyone, and a static page can't carry short-lived links.
    -- Nothing else lives here, and uploads go through the app's server (service role) only.
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('work-photos', 'work-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set
      public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  stripe_customer_id text not null check (stripe_customer_id ~ '^cus_[A-Za-z0-9_]+$'),
  stripe_subscription_id text not null unique check (stripe_subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  plan text not null check (plan in ('monthly', 'annual')),
  -- Stripe's status as given (active, trialing, past_due, canceled, unpaid, incomplete, incomplete_expired, paused).
  status text not null check (status ~ '^[a-z_]{1,40}$'),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- When Stripe's data in this row was true (the event's time, or when it was fetched). Older data never overwrites it.
  stripe_as_of timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_provider_idx on public.subscriptions (provider_id, updated_at desc);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from public, anon, authenticated, service_role;

create table if not exists public.stripe_events (
  id text primary key check (char_length(id) between 1 and 255),
  type text not null,
  outcome text not null,
  received_at timestamptz not null default now()
);
create index if not exists stripe_events_received_idx on public.stripe_events (received_at);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from public, anon, authenticated, service_role;

create table if not exists public.pro_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  kind text not null check (kind in ('photo_id', 'insurance', 'accreditation')),
  storage_path text check (storage_path is null or char_length(storage_path) <= 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text check (reason is null or char_length(reason) between 1 and 300),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  file_deleted_at timestamptz,
  constraint pro_documents_decided check ((status = 'pending') = (decided_at is null)),
  constraint pro_documents_file check (storage_path is not null or file_deleted_at is not null)
);
create index if not exists pro_documents_provider_idx on public.pro_documents (provider_id, kind, created_at);
create index if not exists pro_documents_pending_idx on public.pro_documents (created_at) where status = 'pending';
alter table public.pro_documents enable row level security;
revoke all on public.pro_documents from public, anon, authenticated, service_role;

create table if not exists public.work_photos (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 200),
  width int not null check (width between 1 and 4000),
  height int not null check (height between 1 and 4000),
  position int not null check (position between 1 and 6),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists work_photos_provider_idx on public.work_photos (provider_id, position) where removed_at is null;
alter table public.work_photos enable row level security;
revoke all on public.work_photos from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- is Pro on?
create or replace function private.is_pro(p_provider uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.provider_id = p_provider
      and (s.status in ('active', 'trialing')
           or (s.status = 'past_due' and s.current_period_end is not null
               and now() < s.current_period_end + interval '14 days'))
  );
$$;
revoke execute on function private.is_pro(uuid) from public;
-- The public view calls it (as the reader). It isn't in an exposed schema, so nobody can ask it directly.
grant execute on function private.is_pro(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- provider_public (000028 body + Pro's two columns)
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
  ), '[]'::jsonb) else '[]'::jsonb end as photos
from public.providers p
cross join lateral private.provider_stats(p.id) s
cross join lateral (select private.availability_now(p.availability, p.available_until, p.availability_set_at) as status) a
cross join lateral (select private.is_pro(p.id) as active) pro
where p.status = 'live';

alter view public.provider_public owner to postgres;
grant select on public.provider_public to anon, authenticated;

-- ---------------------------------------------------------------- Stripe (service role only)
-- Writes Stripe's view of one subscription. p_sub: {provider_id (only used for a new row), customer, subscription,
-- plan, status, current_period_end (ISO), cancel_at_period_end, as_of (ISO)}. Returns {outcome, slug}:
-- outcome 'applied', 'unchanged', 'stale' (older than what's stored) or 'unknown_provider'.
create or replace function private.upsert_subscription(p_sub jsonb, p_source text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.subscriptions;
  v_sub text := p_sub ->> 'subscription';
  v_customer text := p_sub ->> 'customer';
  v_plan text := p_sub ->> 'plan';
  v_status text := p_sub ->> 'status';
  v_end timestamptz := nullif(p_sub ->> 'current_period_end', '')::timestamptz;
  v_cancel boolean := coalesce((p_sub ->> 'cancel_at_period_end')::boolean, false);
  v_as_of timestamptz := coalesce(nullif(p_sub ->> 'as_of', '')::timestamptz, now());
  v_provider uuid;
  v_slug text;
begin
  if v_sub is null or v_customer is null or v_plan is null or v_status is null then
    raise exception 'bad_subscription';
  end if;
  select * into v_old from public.subscriptions where stripe_subscription_id = v_sub for update;
  -- A subscription always stays with the listing it was bought for, whatever a later message says.
  if v_old.id is not null then
    v_provider := v_old.provider_id;
  elsif (p_sub ->> 'provider_id') ~ '^[0-9a-fA-F-]{36}$' then
    v_provider := (p_sub ->> 'provider_id')::uuid;
  end if;
  select slug into v_slug from public.providers where id = v_provider;
  if v_slug is null then
    return jsonb_build_object('outcome', 'unknown_provider', 'slug', null);
  end if;
  if v_old.id is not null and v_old.stripe_as_of > v_as_of then
    return jsonb_build_object('outcome', 'stale', 'slug', v_slug);
  end if;
  if v_old.id is not null and v_old.status = v_status and v_old.plan = v_plan
     and v_old.current_period_end is not distinct from v_end and v_old.cancel_at_period_end = v_cancel
     and v_old.stripe_customer_id = v_customer then
    update public.subscriptions set stripe_as_of = v_as_of where id = v_old.id;
    return jsonb_build_object('outcome', 'unchanged', 'slug', v_slug);
  end if;

  insert into public.subscriptions (provider_id, stripe_customer_id, stripe_subscription_id, plan, status,
                                    current_period_end, cancel_at_period_end, stripe_as_of)
  values (v_provider, v_customer, v_sub, v_plan, v_status, v_end, v_cancel, v_as_of)
  on conflict (stripe_subscription_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    plan = excluded.plan,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_as_of = excluded.stripe_as_of,
    updated_at = now();
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (null, p_source, 'provider', v_provider::text,
          v_status || ' (' || v_plan || ')' || case when v_cancel then ', cancels at period end' else '' end
          || case when v_old.id is null then ', new' else ', was ' || v_old.status end);
  return jsonb_build_object('outcome', 'applied', 'slug', v_slug);
end;
$$;
revoke execute on function private.upsert_subscription(jsonb, text) from public, anon, authenticated;

-- True when this webhook event has already been handled (the app then skips Stripe calls for it).
create or replace function public.stripe_event_seen(p_event_id text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.stripe_events where id = p_event_id);
$$;

-- Handles one webhook event exactly once: records its id and (with p_sub) writes the subscription, in one
-- transaction. A redelivered event returns outcome 'duplicate' and changes nothing. Returns {outcome, slug}.
create or replace function public.stripe_apply_event(p_event_id text, p_type text, p_sub jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb := jsonb_build_object('outcome', 'recorded', 'slug', null);
begin
  if p_event_id is null or p_type is null then
    raise exception 'bad_event';
  end if;
  insert into public.stripe_events (id, type, outcome) values (p_event_id, p_type, 'pending')
  on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('outcome', 'duplicate', 'slug', null);
  end if;
  if p_sub is not null then
    v := private.upsert_subscription(p_sub, 'stripe_subscription');
  end if;
  update public.stripe_events set outcome = v ->> 'outcome' where id = p_event_id;
  delete from public.stripe_events where received_at < now() - interval '90 days';
  return v;
end;
$$;

-- The reconciliation script (scripts/stripe-reconcile.mjs): Stripe's current data, as fetched now.
create or replace function public.stripe_reconcile_subscription(p_sub jsonb) returns jsonb
language sql security definer set search_path = ''
as $$
  select private.upsert_subscription(p_sub, 'stripe_reconcile');
$$;

-- Every stored subscription, for the reconciliation script.
create or replace function public.stripe_list_subscriptions() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider_id', s.provider_id, 'customer', s.stripe_customer_id, 'subscription', s.stripe_subscription_id,
    'plan', s.plan, 'status', s.status, 'current_period_end', s.current_period_end,
    'cancel_at_period_end', s.cancel_at_period_end
  ) order by s.created_at), '[]'::jsonb)
  from public.subscriptions s;
$$;

-- The listing's latest Stripe customer (for the billing portal and a returning trader's checkout), or null.
create or replace function public.stripe_customer_for(p_provider uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select s.stripe_customer_id from public.subscriptions s
  where s.provider_id = p_provider order by s.updated_at desc, s.created_at desc limit 1;
$$;

-- ---------------------------------------------------------------- the trader's own Pro
-- {is_pro, subscription: {plan, status, current_period_end, cancel_at_period_end, grace_until} or null (the latest),
--  id_check: {status 'none'|'pending'|'approved'|'rejected', reason, decided_at}, documents: [...], photos: [...]}.
create or replace function public.my_pro_status(p_provider uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_id public.pro_documents;
begin
  if auth.uid() is null or not exists (
    select 1 from public.providers where id = p_provider and user_id = auth.uid() and status <> 'removed'
  ) then
    raise exception 'not_your_listing';
  end if;
  select * into v_sub from public.subscriptions where provider_id = p_provider
  order by (status in ('active', 'trialing', 'past_due')) desc, updated_at desc, created_at desc limit 1;
  select * into v_id from public.pro_documents where provider_id = p_provider and kind = 'photo_id'
  order by (status = 'approved') desc, created_at desc limit 1;
  return jsonb_build_object(
    'is_pro', private.is_pro(p_provider),
    'subscription', case when v_sub.id is null then null else jsonb_build_object(
      'plan', v_sub.plan, 'status', v_sub.status, 'current_period_end', v_sub.current_period_end,
      'cancel_at_period_end', v_sub.cancel_at_period_end,
      'grace_until', case when v_sub.status = 'past_due' then v_sub.current_period_end + interval '14 days' end) end,
    'id_check', jsonb_build_object('status', coalesce(v_id.status, 'none'),
      'reason', v_id.reason, 'decided_at', v_id.decided_at),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'status', d.status, 'reason', d.reason,
                                          'created_at', d.created_at, 'decided_at', d.decided_at)
                       order by d.created_at desc)
      from public.pro_documents d where d.provider_id = p_provider), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'path', w.storage_path, 'width', w.width, 'height', w.height,
                                          'position', w.position) order by w.position, w.created_at)
      from public.work_photos w where w.provider_id = p_provider and w.removed_at is null), '[]'::jsonb)
  );
end;
$$;

-- The caller's listing for a Pro change: theirs, not removed, account not blocked, and (unless p_any) Pro on.
create or replace function private.my_pro_listing(p_provider uuid, p_need_pro boolean) returns public.providers
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
begin
  v := private.my_listing(p_provider);
  if exists (select 1 from public.profiles where user_id = auth.uid() and blocked_at is not null) then
    raise exception 'blocked';
  end if;
  if p_need_pro and not private.is_pro(v.id) then
    raise exception 'not_pro';
  end if;
  return v;
end;
$$;
revoke execute on function private.my_pro_listing(uuid, boolean) from public, anon, authenticated;

-- Records a document the app has stored at <provider id>/<file> in 'pro-id'. Raises not_pro, bad_kind, bad_path,
-- bad_type, id_pending (a photo ID is already waiting), id_approved (already checked) or too_many_documents.
create or replace function public.add_my_pro_document(p_provider uuid, p_kind text, p_path text, p_mime text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
  v_id uuid;
begin
  v := private.my_pro_listing(p_provider, true);
  if p_kind is null or p_kind not in ('photo_id', 'insurance', 'accreditation') then
    raise exception 'bad_kind';
  end if;
  if p_path is null or left(p_path, 37) <> v.id::text || '/' or p_path like '%..%' or char_length(p_path) > 200 then
    raise exception 'bad_path';
  end if;
  if p_mime is null or p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'bad_type';
  end if;
  if p_kind = 'photo_id' then
    if exists (select 1 from public.pro_documents where provider_id = v.id and kind = 'photo_id' and status = 'pending') then
      raise exception 'id_pending';
    end if;
    if exists (select 1 from public.pro_documents where provider_id = v.id and kind = 'photo_id' and status = 'approved') then
      raise exception 'id_approved';
    end if;
  end if;
  if (select count(*) from public.pro_documents where provider_id = v.id and status = 'pending') >= 5 then
    raise exception 'too_many_documents';
  end if;
  insert into public.pro_documents (provider_id, kind, storage_path, mime_type, uploaded_by)
  values (v.id, p_kind, p_path, p_mime, auth.uid())
  returning id into v_id;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'pro_document_sent', 'provider', v.id::text, p_kind);
  return v_id;
end;
$$;

-- Records a photo the app has stored at <provider id>/<file> in 'work-photos', last in the order. Returns the slug.
-- Raises not_pro, bad_path, bad_size or too_many_photos (6 showing).
create or replace function public.add_my_work_photo(p_provider uuid, p_path text, p_width int, p_height int)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
  v_n int;
begin
  v := private.my_pro_listing(p_provider, true);
  if p_path is null or left(p_path, 37) <> v.id::text || '/' or p_path like '%..%' or char_length(p_path) > 200 then
    raise exception 'bad_path';
  end if;
  if p_width is null or p_height is null or p_width not between 1 and 4000 or p_height not between 1 and 4000 then
    raise exception 'bad_size';
  end if;
  select count(*) into v_n from public.work_photos where provider_id = v.id and removed_at is null;
  if v_n >= 6 then
    raise exception 'too_many_photos';
  end if;
  insert into public.work_photos (provider_id, storage_path, width, height, position)
  values (v.id, p_path, p_width, p_height, v_n + 1);
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'work_photo_added', 'provider', v.id::text, p_path);
  return v.slug;
end;
$$;

-- Numbers the showing photos 1, 2, 3 ... in their current order.
create or replace function private.renumber_work_photos(p_provider uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.work_photos w set position = o.n
  from (
    select id, row_number() over (order by position, created_at)::int as n
    from public.work_photos where provider_id = p_provider and removed_at is null
  ) o
  where w.id = o.id and w.position <> o.n;
$$;
revoke execute on function private.renumber_work_photos(uuid) from public, anon, authenticated;

-- Takes a photo off (Pro or not: a trader can always remove their photos). Returns {slug, path}; the app deletes the
-- file. Raises photo_not_found.
create or replace function public.remove_my_work_photo(p_provider uuid, p_photo uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
  v_path text;
begin
  v := private.my_listing(p_provider);
  update public.work_photos set removed_at = now()
  where id = p_photo and provider_id = v.id and removed_at is null
  returning storage_path into v_path;
  if v_path is null then
    raise exception 'photo_not_found';
  end if;
  perform private.renumber_work_photos(v.id);
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'work_photo_removed', 'provider', v.id::text, v_path);
  return jsonb_build_object('slug', v.slug, 'path', v_path);
end;
$$;

-- Puts the showing photos in this order (every one of them, once). Returns the slug. Raises not_pro or bad_order.
create or replace function public.reorder_my_work_photos(p_provider uuid, p_ids uuid[]) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.providers;
  v_current uuid[];
begin
  v := private.my_pro_listing(p_provider, true);
  select coalesce(array_agg(id order by id), '{}') into v_current
  from public.work_photos where provider_id = v.id and removed_at is null;
  if p_ids is null or cardinality(p_ids) <> cardinality(v_current)
     or (select array_agg(x order by x) from unnest(p_ids) x) is distinct from v_current
     or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception 'bad_order';
  end if;
  update public.work_photos w set position = o.n
  from unnest(p_ids) with ordinality o(id, n)
  where w.id = o.id;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'work_photos_reordered', 'provider', v.id::text, null);
  return v.slug;
end;
$$;

-- ---------------------------------------------------------------- the admin
-- {traders: [{provider_id, slug, business_name, is_pro, plan, status, current_period_end, cancel_at_period_end,
--   id_status, photo_count}] (every listing with a subscription, Pro first), pending: [documents waiting]}.
create or replace function public.admin_pro_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'traders', coalesce((
      select jsonb_agg(t order by (t ->> 'is_pro')::boolean desc, t ->> 'business_name')
      from (
        select jsonb_build_object(
          'provider_id', p.id, 'slug', p.slug, 'business_name', p.business_name, 'listing_status', p.status,
          'is_pro', private.is_pro(p.id), 'plan', s.plan, 'status', s.status,
          'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end,
          'id_status', coalesce((
            select d.status from public.pro_documents d where d.provider_id = p.id and d.kind = 'photo_id'
            order by (d.status = 'approved') desc, d.created_at desc limit 1), 'none'),
          'photo_count', (select count(*) from public.work_photos w where w.provider_id = p.id and w.removed_at is null)
        ) as t
        from public.providers p
        cross join lateral (
          select * from public.subscriptions s where s.provider_id = p.id
          order by (s.status in ('active', 'trialing', 'past_due')) desc, s.updated_at desc limit 1
        ) s
      ) x
    ), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'kind', d.kind, 'mime_type', d.mime_type, 'created_at', d.created_at,
        'provider_id', p.id, 'slug', p.slug, 'business_name', p.business_name, 'contact_name', p.contact_name,
        'is_pro', private.is_pro(p.id)
      ) order by d.created_at)
      from public.pro_documents d join public.providers p on p.id = d.provider_id
      where d.status = 'pending'
    ), '[]'::jsonb)
  );
end;
$$;

-- The stored path of a document, for a short-lived signed link. Every look is audited. Null once the file is deleted.
create or replace function public.admin_pro_document_path(p_doc uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.pro_documents;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  select * into v from public.pro_documents where id = p_doc;
  if v.id is null then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  if v.storage_path is not null then
    insert into public.audit_log (actor_id, action, target_type, target_id, reason)
    values (auth.uid(), 'view_pro_document', 'pro_document', v.id::text, v.kind);
  end if;
  return v.storage_path;
end;
$$;

-- Approves or rejects a waiting document; rejecting needs a reason (the trader sees it). Returns the listing's slug.
-- Raises bad_decision, reason_required, reason_too_long or already_decided. A rejected photo ID: refund in Stripe.
create or replace function public.admin_decide_pro_document(p_doc uuid, p_decision text, p_reason text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.pro_documents;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'bad_decision';
  end if;
  if p_decision = 'rejected' and v_reason is null then
    raise exception 'reason_required';
  end if;
  if char_length(v_reason) > 300 then
    raise exception 'reason_too_long';
  end if;
  select * into v from public.pro_documents where id = p_doc for update;
  if v.id is null then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  if v.status <> 'pending' then
    raise exception 'already_decided';
  end if;
  update public.pro_documents
  set status = p_decision, reason = v_reason, decided_at = now(), decided_by = auth.uid()
  where id = v.id;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'pro_document_' || p_decision, 'provider', v.provider_id::text,
          v.kind || coalesce(': ' || v_reason, ''));
  return (select slug from public.providers where id = v.provider_id);
end;
$$;

-- One listing's Pro, for the admin's provider page: {is_pro, subscriptions: [...], documents: [...], photo_count}.
create or replace function public.admin_provider_pro(p_provider uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'is_pro', private.is_pro(p_provider),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('plan', s.plan, 'status', s.status,
        'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end,
        'stripe_customer_id', s.stripe_customer_id, 'stripe_subscription_id', s.stripe_subscription_id,
        'created_at', s.created_at, 'updated_at', s.updated_at) order by s.created_at desc)
      from public.subscriptions s where s.provider_id = p_provider), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'status', d.status, 'reason', d.reason,
        'created_at', d.created_at, 'decided_at', d.decided_at, 'file_deleted', d.storage_path is null)
        order by d.created_at desc)
      from public.pro_documents d where d.provider_id = p_provider), '[]'::jsonb),
    'photo_count', (select count(*) from public.work_photos w where w.provider_id = p_provider and w.removed_at is null)
  );
end;
$$;

-- Documents decided over 30 days ago whose file is still stored (the privacy notice's promise).
create or replace function public.pro_id_files_due(p_limit int default 100)
returns table (id uuid, storage_path text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_admin_or_service();
  return query
    select d.id, d.storage_path
    from public.pro_documents d
    where d.decided_at is not null and d.decided_at <= now() - interval '30 days' and d.storage_path is not null
    order by d.decided_at, d.id
    limit greatest(coalesce(p_limit, 100), 1);
end;
$$;

-- Called after the files are gone from Storage. Only marks documents that are really due. Returns how many.
create or replace function public.mark_pro_id_files_deleted(p_ids uuid[]) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_n int;
begin
  perform private.require_admin_or_service();
  with marked as (
    update public.pro_documents d
    set storage_path = null, file_deleted_at = now()
    where d.id = any(coalesce(p_ids, '{}'))
      and d.decided_at is not null and d.decided_at <= now() - interval '30 days' and d.storage_path is not null
    returning d.id
  ), logged as (
    insert into public.audit_log (actor_id, action, target_type, target_id, reason)
    select auth.uid(), 'delete_pro_document_file', 'pro_document', id::text, '30 days after the decision' from marked
    returning 1
  )
  select count(*) into v_n from logged;
  return v_n;
end;
$$;

-- admin_counts (000026 body + documents waiting for the Pro page).
create or replace function public.admin_counts() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'pending', (select count(*) from public.reviews where status = 'pending'),
    'under_check', (select count(*) from public.reviews where status = 'under_check'),
    'open_flags', (select count(*) from public.flags where status = 'open'),
    'pending_proofs', (select count(*) from public.review_proofs pr join public.reviews r on r.id = pr.review_id
                       where pr.outcome = 'pending' and r.status <> 'removed'),
    'listing_requests', (select count(*) from public.listing_requests where status = 'new'),
    'pending_pro_documents', (select count(*) from public.pro_documents where status = 'pending')
  );
end;
$$;

-- ---------------------------------------------------------------- grants
do $$
declare
  f text;
begin
  -- Stripe's side: the webhook and the reconciliation script, with the service role key.
  foreach f in array array[
    'public.stripe_event_seen(text)',
    'public.stripe_apply_event(text, text, jsonb)',
    'public.stripe_reconcile_subscription(jsonb)',
    'public.stripe_list_subscriptions()',
    'public.stripe_customer_for(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- Signed-in accounts (each checks the caller: the linked trader, or the admin).
  foreach f in array array[
    'public.my_pro_status(uuid)',
    'public.add_my_pro_document(uuid, text, text, text)',
    'public.add_my_work_photo(uuid, text, int, int)',
    'public.remove_my_work_photo(uuid, uuid)',
    'public.reorder_my_work_photos(uuid, uuid[])',
    'public.admin_pro_overview()',
    'public.admin_pro_document_path(uuid)',
    'public.admin_decide_pro_document(uuid, text, text)',
    'public.admin_provider_pro(uuid)',
    'public.admin_counts()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.pro_id_files_due(int)', 'public.mark_pro_id_files_deleted(uuid[])'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
