-- Plan 2b Task 8: reviews from email-only accounts are held for the admin's approval.
--
--   * Review status 'pending' (new): like under_notice, it neither shows publicly nor counts toward scores
--     (public queries keep filtering status in ('published', 'under_check')).
--   * submit_review holds a review when the reviewer's sign-in kind is 'email' (an email code, no Google
--     identity). Automatic flags still run and are recorded on held reviews; only published reviews flip to
--     under_check automatically.
--   * edit_review: an email-only account's edit of a published or under-check review puts it back to pending.
--   * admin_counts gains "pending"; admin_list_reviews_pending lists them (oldest first, with open flags and the
--     reviewer's sign-in kind).
--   * admin_set_review_status: pending → published (action approve_review; under_check instead while the review
--     has an open automatic flag) and pending → removed (reason required, action remove_review, open flags
--     resolved). Every other transition is unchanged.
-- The literal 'pending' review status appears only inside plpgsql function bodies (so the enum value can be
-- added and used in one transaction in the production script). Re-runnable.

alter type public.review_status add value if not exists 'pending';

-- ---------------------------------------------------------------- submit / edit (000013 bodies + holding)
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
            f.quality, f.tidy, f.use_again, f.comment,
            -- Email-only accounts (the weaker check) wait for the admin; Google and phone accounts publish.
            case when private.sign_in_kind(v_uid) = 'email' then 'pending' else 'published' end::public.review_status,
            nullif(p_device_hash, ''))
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
  -- An email-only account's edit waits for the admin again.
  if private.sign_in_kind(v_uid) = 'email' then
    update public.reviews set status = 'pending'
    where id = p_id and status in ('published', 'under_check');
  end if;

  perform private.run_review_flags(p_id);
  select status into v_status from public.reviews where id = p_id;
  return jsonb_build_object('id', p_id, 'status', v_status);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.submit_review(uuid, jsonb, text)', 'public.edit_review(uuid, uuid, jsonb, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- admin reads
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
                       where pr.outcome = 'pending' and r.status <> 'removed')
  );
end;
$$;

create or replace function public.admin_list_reviews_pending() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(private.admin_review_json(r.id) || jsonb_build_object(
      'sign_in_kind', private.sign_in_kind(r.reviewer_id),
      'flags', coalesce((
        select jsonb_agg(jsonb_build_object('id', f.id, 'rule', f.rule, 'source', f.source, 'note', f.note,
                                            'created_at', f.created_at) order by f.created_at)
        from public.flags f where f.target_type = 'review' and f.target_id = r.id and f.status = 'open'
      ), '[]'::jsonb)) order by r.created_at, r.id)
    from public.reviews r where r.status = 'pending'
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_list_reviews_pending() from public, anon;
grant execute on function public.admin_list_reviews_pending() to authenticated;

-- ---------------------------------------------------------------- admin writes
-- pending     -> published (approve: under_check instead while an automatic flag is open)
-- pending     -> removed (reason required and stored; resolves all the review's open flags)
-- under_check -> published (clear: resolves the review's open automatic flags; a report stays for its own answer)
-- published   -> under_check (reason required)
-- published | under_check -> removed (reason required and stored; resolves all the review's open flags)
-- Anything else, including any way back from removed, is refused.
create or replace function public.admin_set_review_status(p_review uuid, p_status public.review_status, p_reason text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reviews;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_action text;
  v_status public.review_status := p_status;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  select * into r from public.reviews where id = p_review for update;
  if r.id is null then
    raise exception 'review not found' using errcode = 'P0002';
  end if;

  if r.status = 'pending' and p_status = 'published' then
    v_action := 'approve_review';
    if exists (select 1 from public.flags f
               where f.target_type = 'review' and f.target_id = p_review and f.status = 'open' and f.source = 'auto') then
      v_status := 'under_check';
    end if;
  elsif r.status = 'under_check' and p_status = 'published' then
    v_action := 'clear_review';
    update public.flags set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
      resolution_note = coalesce(v_reason, 'Cleared')
    where target_type = 'review' and target_id = p_review and status = 'open' and source = 'auto';
  elsif r.status = 'published' and p_status = 'under_check' then
    if v_reason is null then
      raise exception 'a reason is required to put a review under check' using errcode = 'check_violation';
    end if;
    v_action := 'check_review';
  elsif r.status in ('pending', 'published', 'under_check') and p_status = 'removed' then
    if v_reason is null then
      raise exception 'a reason is required to remove a review' using errcode = 'check_violation';
    end if;
    v_action := 'remove_review';
    update public.flags set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
      resolution_note = 'Review removed: ' || v_reason
    where target_type = 'review' and target_id = p_review and status = 'open';
  else
    raise exception 'transition not allowed';
  end if;

  update public.reviews
  set status = v_status,
      removal_reason = case when v_status = 'removed' then v_reason else removal_reason end
  where id = p_review;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), v_action, 'review', p_review::text, v_reason);
  return (select slug from public.providers where id = r.provider_id);
end;
$$;
