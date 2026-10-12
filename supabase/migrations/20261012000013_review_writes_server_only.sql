-- Final review 2, I1 (with M9 and M10): the review-writing functions are for the app's server only.
--
-- Before: submit_review / edit_review / add_review_proof were granted to `authenticated` and took the device
-- hash from the caller. The server action computed it, but anyone signed in could call the RPC through the
-- public API with their own session and pass a fresh or empty hash, so the shared-device rule never fired
-- for someone running several accounts. add_review_proof could also record a proof with no file behind it.
--
-- Now:
--   * submit_review(p_uid, p, p_device_hash), edit_review(p_uid, p_id, p, p_device_hash) and
--     add_review_proof(p_uid, p_review, p_path, p_mime) are service_role only. The server action passes the
--     user id from the verified session and the device hash it computed from the request; the browser
--     never chooses either. The old client-callable versions are dropped.
--   * An edit records the device it came from in reviews.edit_device_hash (the posting device stays in
--     device_hash), and the shared-device rule compares every device a review was posted or edited from.
-- Every other rule is unchanged. Re-runnable.

alter table public.reviews add column if not exists edit_device_hash text;

drop function if exists public.submit_review(jsonb, text);
drop function if exists public.edit_review(uuid, jsonb, text);
drop function if exists public.add_review_proof(uuid, text, text);

-- ---------------------------------------------------------------- auto-flag rules: every device counts
create or replace function private.run_review_flags(p_review uuid) returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reviews;
  v_created timestamptz;
  v_ids uuid[];
  v_rules text[];
  v_new uuid[];
  v_devices text[];
begin
  select * into r from public.reviews where id = p_review;
  if r.id is null or r.status = 'removed' then
    return '{}'::text[];
  end if;
  select created_at into v_created from auth.users where id = r.reviewer_id;
  -- Every device this review was posted or edited from.
  v_devices := array_remove(array[r.device_hash, r.edit_device_hash], null);

  with live as (
    select x.id, x.reviewer_id, x.created_at, array[x.device_hash, x.edit_device_hash] as devices,
           u.created_at as account_created
    from public.reviews x
    left join auth.users u on u.id = x.reviewer_id
    where x.provider_id = r.provider_id and x.status <> 'removed'
  ),
  burst as (
    select id, 'burst_48h'::text as rule from live
    where created_at > now() - interval '48 hours'
      and (select count(*) from live where created_at > now() - interval '48 hours') >= 3
  ),
  together as (
    select id, 'accounts_created_together'::text from live
    where v_created is not null
      and account_created between v_created - interval '10 minutes' and v_created + interval '10 minutes'
      and (select count(distinct reviewer_id) from live
           where account_created between v_created - interval '10 minutes' and v_created + interval '10 minutes') >= 3
  ),
  device as (
    select id, 'shared_device'::text from live
    where cardinality(v_devices) > 0
      and devices && v_devices
      and exists (select 1 from live o where o.devices && v_devices and o.reviewer_id <> r.reviewer_id)
  ),
  extreme as (
    select r.id, 'lone_extreme_new_account'::text
    where v_created > now() - interval '24 hours'
      and r.quality in (1, 5)
      and (select count(*) from public.reviews where reviewer_id = r.reviewer_id) = 1
  ),
  hits as (
    select * from burst union select * from together union select * from device union select * from extreme
  )
  select array_agg(id), array_agg(rule) into v_ids, v_rules from hits;

  if v_ids is null then
    return '{}'::text[];
  end if;

  with ins as (
    insert into public.flags (target_type, target_id, source, rule)
    select 'review', h.id, 'auto', h.rule from unnest(v_ids, v_rules) as h(id, rule)
    on conflict (target_type, target_id, rule) where source = 'auto' do nothing
    returning target_id
  )
  select array_agg(distinct target_id) into v_new from ins;

  if v_new is not null then
    update public.reviews set status = 'under_check' where id = any (v_new) and status = 'published';
  end if;

  return coalesce((
    select array_agg(distinct h.rule order by h.rule) from unnest(v_ids, v_rules) as h(id, rule) where h.id = p_review
  ), '{}'::text[]);
end;
$$;
revoke execute on function private.run_review_flags(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- submit / edit (service role only)
create or replace function public.submit_review(p_uid uuid, p jsonb, p_device_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := p_uid;
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

create or replace function public.edit_review(p_uid uuid, p_id uuid, p jsonb, p_device_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := p_uid;
  r public.reviews;
  v_profile public.profiles;
  f record;
  v_status public.review_status;
begin
  select * into r from public.reviews where id = p_id;
  if v_uid is null or r.id is null or r.reviewer_id is distinct from v_uid then
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
    edit_device_hash = coalesce(nullif(p_device_hash, ''), edit_device_hash),
    edited_at = now()
  where id = p_id;

  perform private.run_review_flags(p_id);
  select status into v_status from public.reviews where id = p_id;
  return jsonb_build_object('id', p_id, 'status', v_status);
end;
$$;

-- ---------------------------------------------------------------- proofs (service role only)
-- Called by the server action after it has uploaded the file, so a row always has a file behind it.
create or replace function public.add_review_proof(p_uid uuid, p_review uuid, p_path text, p_mime text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reviews;
  v_id uuid;
begin
  select * into r from public.reviews where id = p_review;
  if p_uid is null or r.id is null or r.reviewer_id is distinct from p_uid then
    raise exception 'not_your_review';
  end if;
  if r.status = 'removed' or r.created_at <= now() - interval '14 days' then
    raise exception 'edit_window_closed';
  end if;
  if p_path is null or left(p_path, char_length(p_review::text) + 1) <> p_review::text || '/'
     or p_path like '%..%' or char_length(p_path) > 200 then
    raise exception 'bad_proof_path';
  end if;
  if p_mime is null or p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'bad_proof_type';
  end if;
  begin
    insert into public.review_proofs (review_id, storage_path, mime_type)
    values (p_review, p_path, p_mime)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'proof_exists';
  end;
  return v_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.submit_review(uuid, jsonb, text)',
    'public.edit_review(uuid, uuid, jsonb, text)',
    'public.add_review_proof(uuid, uuid, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
