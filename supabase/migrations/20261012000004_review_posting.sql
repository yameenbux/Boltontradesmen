-- Review posting (Plan 2, Task 6): proof, reply and flag tables (closed to browsers), and the functions
-- that are the only way to write a review. Every anti-fake posting rule lives here, so no path around the
-- app can skip them. Re-runnable: if not exists / create or replace.

-- ---------------------------------------------------------------- tables
create table if not exists public.review_proofs (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  outcome text not null default 'pending' check (outcome in ('pending', 'accepted', 'rejected')),
  note text,
  checked_at timestamptz,
  checked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists one_active_proof_per_review on public.review_proofs (review_id)
  where outcome in ('pending', 'accepted');

create table if not exists public.review_responses (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews (id) on delete restrict,
  provider_id uuid not null references public.providers (id) on delete restrict,
  author_id uuid not null references auth.users (id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 400),
  status text not null default 'published' check (status in ('published', 'removed')),
  removal_reason text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint review_responses_removed_requires_reason
    check (status <> 'removed' or nullif(btrim(removal_reason), '') is not null)
);

create table if not exists public.flags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('review', 'reply')),
  target_id uuid not null,
  source text not null check (source in ('auto', 'user')),
  rule text not null,
  note text,
  reporter_id uuid references auth.users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists flags_auto_once on public.flags (target_type, target_id, rule) where source = 'auto';
create unique index if not exists flags_one_open_report on public.flags (target_type, target_id, reporter_id)
  where source = 'user' and status = 'open';
create index if not exists flags_open_idx on public.flags (status, created_at);
create index if not exists review_proofs_review_idx on public.review_proofs (review_id);

alter table public.review_proofs enable row level security;
alter table public.review_responses enable row level security;
alter table public.flags enable row level security;
revoke all on public.review_proofs, public.review_responses, public.flags from public, anon, authenticated;

-- ---------------------------------------------------------------- auto-flag rules (stub; Task 7 replaces it)
create or replace function private.run_review_flags(p_review uuid) returns text[]
language plpgsql security definer set search_path = ''
as $$
begin
  return '{}'::text[];
end;
$$;
revoke execute on function private.run_review_flags(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- shared checks
-- Why the caller may not post a new review of this provider, or null. Covers the person and the
-- relationship (not the answers).
create or replace function private.review_block_reason(p_uid uuid, p_provider uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_created timestamptz;
begin
  select * into v_profile from public.profiles where user_id = p_uid;
  if v_profile.user_id is null or v_profile.deleted_at is not null or v_profile.display_name is null then
    return 'not_member';
  end if;
  if v_profile.blocked_at is not null then
    return 'blocked';
  end if;
  if not exists (select 1 from public.providers where id = p_provider and status = 'live') then
    return 'provider_not_found';
  end if;
  if exists (select 1 from public.providers where id = p_provider and user_id = p_uid) then
    return 'own_listing';
  end if;
  if exists (
    select 1
    from public.providers mine
    join public.provider_categories mc on mc.provider_id = mine.id
    join public.provider_categories tc on tc.category_id = mc.category_id and tc.provider_id = p_provider
    where mine.user_id = p_uid and mine.status <> 'removed'
  ) then
    return 'shares_category';
  end if;
  if exists (
    select 1 from public.reviews
    where provider_id = p_provider and reviewer_id = p_uid and status = 'removed'
      and removal_reason is distinct from 'Reviewer deleted their account'
  ) then
    return 'removed_before';
  end if;
  select created_at into v_created from auth.users where id = p_uid;
  if v_created > now() - interval '24 hours'
     and exists (select 1 from public.reviews where reviewer_id = p_uid) then
    return 'new_account_limit';
  end if;
  return null;
end;
$$;
revoke execute on function private.review_block_reason(uuid, uuid) from public, anon, authenticated;

-- Validates and normalises the answers for (provider, category). Raises the error code on failure.
create or replace function private.review_fields(p_provider uuid, p jsonb)
returns table (
  category_id uuid, job_month date, value_band public.value_band, on_time public.on_time_answer,
  on_price public.on_price_answer, quality smallint, tidy boolean, use_again public.use_again_answer, comment text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cat uuid;
  v_asks_tidy boolean;
  v_month date;
  v_this_month date := date_trunc('month', now() at time zone 'Europe/London')::date;
  v_comment text;
begin
  begin
    v_cat := (p ->> 'category_id')::uuid;
  exception when others then
    raise exception 'bad_category';
  end;
  select g.asks_tidy into v_asks_tidy
  from public.categories c join public.category_groups g on g.id = c.group_id
  where c.id = v_cat and c.active
    and exists (select 1 from public.provider_categories pc where pc.provider_id = p_provider and pc.category_id = v_cat)
    and public.category_visible(p_provider, v_cat);
  if v_asks_tidy is null then
    raise exception 'bad_category';
  end if;

  begin
    if coalesce(p ->> 'job_month', '') !~ '^\d{4}-\d{2}-01$' then
      raise exception 'bad_job_month';
    end if;
    v_month := (p ->> 'job_month')::date;
  exception when others then
    raise exception 'bad_job_month';
  end;
  if v_month > v_this_month or v_month < (v_this_month - interval '36 months')::date then
    raise exception 'bad_job_month';
  end if;

  if v_asks_tidy and jsonb_typeof(p -> 'tidy') is distinct from 'boolean' then
    raise exception 'tidy_required';
  end if;
  if not v_asks_tidy and coalesce(jsonb_typeof(p -> 'tidy'), 'null') <> 'null' then
    raise exception 'tidy_not_asked';
  end if;

  v_comment := nullif(btrim(coalesce(p ->> 'comment', '')), '');
  if char_length(v_comment) > 400 then
    raise exception 'comment_too_long';
  end if;
  -- Ten or more digits, however they are spaced or punctuated, is a phone number.
  if v_comment ~ '([0-9][ ().-]*){10,}' then
    raise exception 'comment_has_phone';
  end if;

  begin
    category_id := v_cat;
    job_month := v_month;
    value_band := (p ->> 'value_band')::public.value_band;
    on_time := (p ->> 'on_time')::public.on_time_answer;
    on_price := (p ->> 'on_price')::public.on_price_answer;
    quality := (p ->> 'quality')::smallint;
    use_again := (p ->> 'use_again')::public.use_again_answer;
  exception when others then
    raise exception 'bad_input';
  end;
  if value_band is null or on_time is null or on_price is null or use_again is null
     or quality is null or quality not between 1 and 5 then
    raise exception 'bad_input';
  end if;
  tidy := case when v_asks_tidy then (p ->> 'tidy')::boolean end;
  comment := v_comment;
  return next;
end;
$$;
revoke execute on function private.review_fields(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- submit / edit
create or replace function public.submit_review(p jsonb, p_device_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_provider uuid;
  v_block text;
  f record;
  v_id uuid;
  v_status public.review_status;
begin
  if v_uid is null then
    raise exception 'not_member';
  end if;
  begin
    v_provider := (p ->> 'provider_id')::uuid;
  exception when others then
    v_provider := null;
  end;
  -- One posting at a time per person, so a double tap cannot slip two reviews past the 24-hour rule.
  perform pg_advisory_xact_lock(hashtext('submit_review:' || v_uid::text));

  v_block := private.review_block_reason(v_uid, v_provider);
  if v_block is not null then
    raise exception '%', v_block;
  end if;
  select * into f from private.review_fields(v_provider, p);

  begin
    insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price,
                                quality, tidy, use_again, comment, status, device_hash)
    values (v_provider, v_uid, f.category_id, f.job_month, f.value_band, f.on_time, f.on_price,
            f.quality, f.tidy, f.use_again, f.comment, 'published', nullif(p_device_hash, ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_reviewed';
  end;

  perform private.run_review_flags(v_id);
  select status into v_status from public.reviews where id = v_id;
  return jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

create or replace function public.edit_review(p_id uuid, p jsonb, p_device_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r public.reviews;
  v_profile public.profiles;
  f record;
  v_status public.review_status;
begin
  select * into r from public.reviews where id = p_id;
  if r.id is null or r.reviewer_id is distinct from v_uid then
    raise exception 'not_your_review';
  end if;
  select * into v_profile from public.profiles where user_id = v_uid;
  if v_profile.user_id is null or v_profile.deleted_at is not null or v_profile.display_name is null then
    raise exception 'not_member';
  end if;
  if v_profile.blocked_at is not null then
    raise exception 'blocked';
  end if;
  if r.status = 'removed' or r.created_at <= now() - interval '14 days' then
    raise exception 'edit_window_closed';
  end if;

  select * into f from private.review_fields(r.provider_id, p);
  update public.reviews set
    category_id = f.category_id, job_month = f.job_month, value_band = f.value_band, on_time = f.on_time,
    on_price = f.on_price, quality = f.quality, tidy = f.tidy, use_again = f.use_again, comment = f.comment,
    edited_at = now()
  where id = p_id;

  perform private.run_review_flags(p_id);
  select status into v_status from public.reviews where id = p_id;
  return jsonb_build_object('id', p_id, 'status', v_status);
end;
$$;

-- ---------------------------------------------------------------- reads for the signed-in pages
create or replace function public.review_form_context(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_provider public.providers;
  v_existing jsonb;
begin
  select * into v_provider from public.providers where slug = p_slug and status = 'live';
  if v_provider.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', r.id, 'category_id', r.category_id, 'job_month', to_char(r.job_month, 'YYYY-MM-DD'),
    'value_band', r.value_band, 'on_time', r.on_time, 'on_price', r.on_price, 'quality', r.quality,
    'tidy', r.tidy, 'use_again', r.use_again, 'comment', r.comment, 'status', r.status,
    'editable_until', r.created_at + interval '14 days',
    'has_active_proof', exists (select 1 from public.review_proofs pr where pr.review_id = r.id and pr.outcome in ('pending', 'accepted'))
  ) into v_existing
  from public.reviews r
  where r.provider_id = v_provider.id and r.reviewer_id = v_uid and r.status <> 'removed';

  return jsonb_build_object(
    'provider', jsonb_build_object('id', v_provider.id, 'slug', v_provider.slug, 'business_name', v_provider.business_name),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'asks_tidy', g.asks_tidy) order by c.name)
      from public.provider_categories pc
      join public.categories c on c.id = pc.category_id
      join public.category_groups g on g.id = c.group_id
      where pc.provider_id = v_provider.id and c.active and public.category_visible(v_provider.id, c.id)
    ), '[]'::jsonb),
    'existing', v_existing,
    'blocked', case when v_existing is null then private.review_block_reason(v_uid, v_provider.id) end
  );
end;
$$;

create or replace function public.my_reviews() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'provider_slug', p.slug, 'business_name', p.business_name, 'status', r.status,
    'removal_reason', r.removal_reason, 'created_at', r.created_at, 'editable_until', r.created_at + interval '14 days'
  ) order by r.created_at desc), '[]'::jsonb)
  from public.reviews r
  join public.providers p on p.id = r.provider_id
  where r.reviewer_id = auth.uid();
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.submit_review(jsonb, text)',
    'public.edit_review(uuid, jsonb, text)',
    'public.review_form_context(text)',
    'public.my_reviews()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
