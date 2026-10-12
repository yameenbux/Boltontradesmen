-- Provider replies (Plan 2, Task 12): a provider signed in with the number on their listing sees the reviews of
-- their listing(s) and replies, once per review, editable for 14 days. Replies go live at once; the admin can
-- remove one for cause (admin_remove_reply). Re-runnable.

create or replace function public.provider_my_reviews() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider', jsonb_build_object('id', p.id, 'slug', p.slug, 'business_name', p.business_name, 'status', p.status),
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

-- Posts the provider's reply to a review of their own listing, or edits it within 14 days.
create or replace function public.provider_reply(p_review uuid, p_body text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r public.reviews;
  v_slug text;
  v_body text := btrim(coalesce(p_body, ''));
  v_existing public.review_responses;
begin
  select * into r from public.reviews where id = p_review;
  select p.slug into v_slug from public.providers p
  where p.id = r.provider_id and p.user_id = v_uid and v_uid is not null and p.status <> 'removed';
  if r.id is null or v_slug is null then
    raise exception 'not_your_listing';
  end if;
  if exists (select 1 from public.profiles where user_id = v_uid and blocked_at is not null) then
    raise exception 'blocked';
  end if;
  if r.status not in ('published', 'under_check') then
    raise exception 'review_not_found';
  end if;
  if v_body = '' then
    raise exception 'reply_empty';
  end if;
  if char_length(v_body) > 400 then
    raise exception 'reply_too_long';
  end if;
  -- Ten or more digits, however they are spaced or punctuated, is a phone number (as for reviews).
  if v_body ~ '([0-9][ ().-]*){10,}' then
    raise exception 'reply_has_phone';
  end if;

  select * into v_existing from public.review_responses where review_id = p_review for update;
  if v_existing.id is null then
    begin
      insert into public.review_responses (review_id, provider_id, author_id, body)
      values (p_review, r.provider_id, v_uid, v_body);
    exception when unique_violation then
      raise exception 'edit_window_closed';
    end;
  elsif v_existing.status = 'removed' then
    raise exception 'reply_removed';
  elsif v_existing.created_at <= now() - interval '14 days' then
    raise exception 'edit_window_closed';
  else
    update public.review_responses set body = v_body, edited_at = now() where id = v_existing.id;
  end if;
  return v_slug;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.provider_my_reviews()', 'public.provider_reply(uuid, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
