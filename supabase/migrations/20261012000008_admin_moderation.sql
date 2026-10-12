-- Admin moderation (Plan 2, Task 11): reviews under check, flags (automatic and reports), proofs and replies.
-- Every function is SECURITY DEFINER, raises 'not admin' unless is_admin(), and writes one audit_log row per
-- write. Removal needs a reason, is stored on the row, and is final (no restore in Plan 2). Re-runnable.

-- ---------------------------------------------------------------- reads
create or replace function public.admin_counts() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'under_check', (select count(*) from public.reviews where status = 'under_check'),
    'open_flags', (select count(*) from public.flags where status = 'open'),
    'pending_proofs', (select count(*) from public.review_proofs pr join public.reviews r on r.id = pr.review_id
                       where pr.outcome = 'pending' and r.status <> 'removed')
  );
end;
$$;

-- One review as the admin sees it (no device hash; the reviewer's name and account age instead).
create or replace function private.admin_review_json(p_review uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'status', r.status, 'created_at', r.created_at, 'edited_at', r.edited_at,
    'job_month', r.job_month, 'value_band', r.value_band, 'on_time', r.on_time, 'on_price', r.on_price,
    'quality', r.quality, 'tidy', r.tidy, 'use_again', r.use_again, 'comment', r.comment,
    'category_name', c.name, 'provider_slug', p.slug, 'business_name', p.business_name,
    'reviewer_name', coalesce(pr.display_name, 'Deleted account'), 'account_created_at', u.created_at,
    'reviewer_review_count', (select count(*) from public.reviews x where x.reviewer_id = r.reviewer_id)
  )
  from public.reviews r
  join public.providers p on p.id = r.provider_id
  join public.categories c on c.id = r.category_id
  left join public.profiles pr on pr.user_id = r.reviewer_id
  left join auth.users u on u.id = r.reviewer_id
  where r.id = p_review;
$$;
revoke execute on function private.admin_review_json(uuid) from public, anon, authenticated;

create or replace function public.admin_list_reviews_under_check() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(private.admin_review_json(r.id) || jsonb_build_object('flags', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'rule', f.rule, 'source', f.source, 'note', f.note,
                                          'created_at', f.created_at) order by f.created_at)
      from public.flags f where f.target_type = 'review' and f.target_id = r.id and f.status = 'open'
    ), '[]'::jsonb)) order by r.created_at)
    from public.reviews r where r.status = 'under_check'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_open_flags() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'target_type', f.target_type, 'target_id', f.target_id, 'source', f.source, 'rule', f.rule,
      'note', f.note, 'created_at', f.created_at,
      'reporter_name', (select display_name from public.profiles where user_id = f.reporter_id),
      'review', case
        when f.target_type = 'review' then private.admin_review_json(f.target_id)
        else private.admin_review_json((select review_id from public.review_responses where id = f.target_id))
      end,
      'reply_body', case when f.target_type = 'reply' then (select body from public.review_responses where id = f.target_id) end
    ) order by f.created_at)
    from public.flags f where f.status = 'open'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_list_pending_proofs() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pr.id, 'mime_type', pr.mime_type, 'created_at', pr.created_at,
      'review', private.admin_review_json(pr.review_id)
    ) order by pr.created_at)
    from public.review_proofs pr
    join public.reviews r on r.id = pr.review_id
    where pr.outcome = 'pending' and r.status <> 'removed'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_proof_path(p_proof uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  return (select storage_path from public.review_proofs where id = p_proof);
end;
$$;

-- ---------------------------------------------------------------- writes
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
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  select * into r from public.reviews where id = p_review for update;
  if r.id is null then
    raise exception 'review not found' using errcode = 'P0002';
  end if;

  if r.status = 'under_check' and p_status = 'published' then
    v_action := 'clear_review';
    update public.flags set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
      resolution_note = coalesce(v_reason, 'Cleared')
    where target_type = 'review' and target_id = p_review and status = 'open' and source = 'auto';
  elsif r.status = 'published' and p_status = 'under_check' then
    if v_reason is null then
      raise exception 'a reason is required to put a review under check' using errcode = 'check_violation';
    end if;
    v_action := 'check_review';
  elsif r.status in ('published', 'under_check') and p_status = 'removed' then
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
  set status = p_status,
      removal_reason = case when p_status = 'removed' then v_reason else removal_reason end
  where id = p_review;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), v_action, 'review', p_review::text, v_reason);
  return (select slug from public.providers where id = r.provider_id);
end;
$$;

create or replace function public.admin_resolve_flag(p_flag uuid, p_outcome text, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('resolved', 'dismissed') then
    raise exception 'outcome must be resolved or dismissed' using errcode = 'check_violation';
  end if;
  update public.flags
  set status = p_outcome, resolved_by = auth.uid(), resolved_at = now(),
      resolution_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_flag and status = 'open';
  if not found then
    raise exception 'flag not open';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'resolve_flag', 'flag', p_flag::text, p_outcome || coalesce(': ' || nullif(btrim(p_note), ''), ''));
end;
$$;

create or replace function public.admin_check_proof(p_proof uuid, p_outcome text, p_note text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_review uuid;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('accepted', 'rejected') then
    raise exception 'outcome must be accepted or rejected' using errcode = 'check_violation';
  end if;
  update public.review_proofs
  set outcome = p_outcome, checked_at = now(), checked_by = auth.uid(),
      note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_proof and outcome = 'pending'
  returning review_id into v_review;
  if v_review is null then
    raise exception 'proof already checked';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'check_proof', 'proof', p_proof::text, p_outcome || coalesce(': ' || nullif(btrim(p_note), ''), ''));
  return (select p.slug from public.reviews r join public.providers p on p.id = r.provider_id where r.id = v_review);
end;
$$;

create or replace function public.admin_remove_reply(p_reply uuid, p_reason text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_provider uuid;
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'a reason is required to remove a reply' using errcode = 'check_violation';
  end if;
  update public.review_responses set status = 'removed', removal_reason = v_reason
  where id = p_reply and status = 'published'
  returning provider_id into v_provider;
  if v_provider is null then
    raise exception 'reply not found' using errcode = 'P0002';
  end if;
  update public.flags set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
    resolution_note = 'Reply removed: ' || v_reason
  where target_type = 'reply' and target_id = p_reply and status = 'open';
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'remove_reply', 'reply', p_reply::text, v_reason);
  return (select slug from public.providers where id = v_provider);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_counts()',
    'public.admin_list_reviews_under_check()',
    'public.admin_list_open_flags()',
    'public.admin_list_pending_proofs()',
    'public.admin_proof_path(uuid)',
    'public.admin_set_review_status(uuid, public.review_status, text)',
    'public.admin_resolve_flag(uuid, text, text)',
    'public.admin_check_proof(uuid, text, text)',
    'public.admin_remove_reply(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
