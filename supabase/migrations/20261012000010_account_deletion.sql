-- Plan 2, Task 13: account deletion with phone retention, and the proof state on my_reviews.
-- Re-runnable: create if not exists / create or replace.

-- ---------------------------------------------------------------- phone_retention
-- Deleted people's phone numbers, kept privately for 12 months in case of legal claims (privacy notice).
-- Readable only by the database owner (the SQL editor); no API role can touch it.
create table if not exists public.phone_retention (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  phone_e164 text not null,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '12 months'
);
create index if not exists phone_retention_user_idx on public.phone_retention (user_id);
create index if not exists phone_retention_purge_idx on public.phone_retention (purge_after);
alter table public.phone_retention enable row level security;
revoke all on table public.phone_retention from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- delete_my_account
-- Idempotent: a retry after a failed Auth soft delete repeats it safely. Returns the slugs of the
-- providers whose public pages change, so the caller can revalidate them.
create or replace function public.delete_my_account() returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_slugs text[];
  c_reason constant text := 'Reviewer deleted their account';
begin
  if v_uid is null then
    raise exception 'not_member';
  end if;

  delete from public.phone_retention where purge_after < now();

  select nullif(btrim(u.phone), '') into v_phone from auth.users u where u.id = v_uid;
  if v_phone is not null and not exists (select 1 from public.phone_retention r where r.user_id = v_uid) then
    insert into public.phone_retention (user_id, phone_e164) values (v_uid, '+' || ltrim(v_phone, '+'));
  end if;

  with taken_down as (
    update public.reviews r set status = 'removed', removal_reason = c_reason
    where r.reviewer_id = v_uid and r.status <> 'removed'
    returning r.provider_id
  ), replies as (
    update public.review_responses rr set status = 'removed', removal_reason = c_reason
    where rr.author_id = v_uid and rr.status <> 'removed'
    returning rr.provider_id
  ), unlinked as (
    update public.providers p set user_id = null
    where p.user_id = v_uid
    returning p.id
  )
  select coalesce(array_agg(distinct p.slug order by p.slug), '{}') into v_slugs
  from public.providers p
  where p.id in (select provider_id from taken_down union select provider_id from replies union select id from unlinked);

  update public.profiles set deleted_at = coalesce(deleted_at, now()), display_name = null where user_id = v_uid;

  if not exists (select 1 from public.audit_log a where a.actor_id = v_uid and a.action = 'delete_account') then
    insert into public.audit_log (actor_id, action, target_type, target_id) values (v_uid, 'delete_account', 'user', v_uid::text);
  end if;

  return v_slugs;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------- my_reviews (+ proof state)
-- Same shape as before plus `proof`: the newest proof's outcome (pending / accepted / rejected) or null.
create or replace function public.my_reviews() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'provider_slug', p.slug, 'business_name', p.business_name, 'status', r.status,
    'removal_reason', r.removal_reason, 'created_at', r.created_at, 'editable_until', r.created_at + interval '14 days',
    'proof', (select rp.outcome from public.review_proofs rp where rp.review_id = r.id order by rp.created_at desc limit 1)
  ) order by r.created_at desc), '[]'::jsonb)
  from public.reviews r
  join public.providers p on p.id = r.provider_id
  where r.reviewer_id = auth.uid();
$$;
revoke execute on function public.my_reviews() from public, anon;
grant execute on function public.my_reviews() to authenticated;
