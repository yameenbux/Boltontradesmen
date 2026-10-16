-- Plan 2b Task 7: hashed sign-in identity keys; removal and blocks survive re-signup for every sign-in method.
--
--   * private.secrets holds a per-project pepper (identity_pepper, 32 random bytes, set once). No API role can
--     read it.
--   * private.identity_key(kind, value) = hex(HMAC-SHA256(pepper, kind || ':' || value)), kind in phone (E.164),
--     email (normalised), google (Google sub = auth.identities.provider_id). private.identity_keys(uid) lists an
--     account's keys: confirmed phone, confirmed email (or a Google account's email), each Google identity.
--   * identity_retention keeps a deleted account's keys for 12 months (never the plain email or Google id).
--     Existing phone_retention rows are backfilled (phone_retention itself stays, for phone accounts).
--   * delete_my_account records the keys; review_block_reason looks them up instead of phone_retention, so a
--     removal for cause or an admin block follows a person to a fresh Google or email-code account.
--   * private.phone_signed_in keeps its name (callers: review_block_reason, report_review, provider_reply) and
--     now means "signed in with Google, an email code or a confirmed phone".
--   * private.code_verify_gate also purges expired identity_retention rows on every code check.
-- Re-runnable: if not exists, create or replace, on conflict do nothing.

-- ---------------------------------------------------------------- pepper
create table if not exists private.secrets (
  key text primary key,
  value bytea not null
);
revoke all on table private.secrets from public, anon, authenticated, service_role;
insert into private.secrets (key, value) values ('identity_pepper', extensions.gen_random_bytes(32))
on conflict (key) do nothing;

-- ---------------------------------------------------------------- keys
create or replace function private.identity_key(p_kind text, p_value text) returns text
language sql stable security definer set search_path = ''
as $$
  select encode(extensions.hmac(convert_to(p_kind || ':' || p_value, 'UTF8'), s.value, 'sha256'), 'hex')
  from private.secrets s where s.key = 'identity_pepper';
$$;
revoke execute on function private.identity_key(text, text) from public, anon, authenticated;

create or replace function private.identity_keys(p_uid uuid) returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct k) filter (where k is not null), '{}'::text[])
  from (
    select private.identity_key('phone', '+' || ltrim(btrim(u.phone), '+')) as k
    from auth.users u
    where u.id = p_uid and coalesce(btrim(u.phone), '') <> '' and u.phone_confirmed_at is not null
    union all
    select private.identity_key('email', private.normalise_email(u.email))
    from auth.users u
    where u.id = p_uid and coalesce(u.email, '') <> '' and private.normalise_email(u.email) is not null
      and (u.email_confirmed_at is not null
           or exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'))
    union all
    select private.identity_key('google', i.provider_id)
    from auth.identities i
    where i.user_id = p_uid and i.provider = 'google' and coalesce(i.provider_id, '') <> ''
  ) keys;
$$;
revoke execute on function private.identity_keys(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- identity_retention
create table if not exists public.identity_retention (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  identity_key text not null,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '12 months'
);
create index if not exists identity_retention_key_idx on public.identity_retention (identity_key);
create index if not exists identity_retention_user_idx on public.identity_retention (user_id);
create index if not exists identity_retention_purge_idx on public.identity_retention (purge_after);
alter table public.identity_retention enable row level security;
revoke all on table public.identity_retention from public, anon, authenticated, service_role;

-- One identity_retention row per phone_retention row (same user, dates), skipping ones already there.
create or replace function private.backfill_identity_retention() returns void
language sql security definer set search_path = ''
as $$
  insert into public.identity_retention (user_id, identity_key, deleted_at, purge_after)
  select pr.user_id, private.identity_key('phone', pr.phone_e164), pr.deleted_at, pr.purge_after
  from public.phone_retention pr
  where not exists (
    select 1 from public.identity_retention ir
    where ir.user_id = pr.user_id and ir.identity_key = private.identity_key('phone', pr.phone_e164)
  );
$$;
revoke execute on function private.backfill_identity_retention() from public, anon, authenticated;
select private.backfill_identity_retention();

-- ---------------------------------------------------------------- who counts as signed in
-- Signed in with Google, an email code or a confirmed phone (private.sign_in_kind); never the admin, an
-- anonymous session or an unconfirmed account. Accounts with neither phone nor email exist only as pgTAP
-- fixtures (GoTrue always stores one: Google's "allow users without an email" is off) and still pass, as before.
create or replace function private.phone_signed_in(p_uid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_uid is not null and (
    coalesce(private.sign_in_kind(p_uid), '') in ('google', 'email', 'phone')
    or exists (
      select 1 from auth.users u
      where u.id = p_uid and coalesce(u.phone, '') = '' and coalesce(u.email, '') = '' and not coalesce(u.is_anonymous, false)
    )
  );
$$;
comment on function private.phone_signed_in(uuid) is
  'Despite the name (kept for its callers): signed in with Google, an email code or a confirmed phone.';
revoke execute on function private.phone_signed_in(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- review_block_reason (000016 body, keys)
create or replace function private.review_block_reason(p_uid uuid, p_provider uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_created timestamptz;
  v_keys text[];
begin
  select * into v_profile from public.profiles where user_id = p_uid;
  if v_profile.user_id is null or v_profile.deleted_at is not null or v_profile.display_name is null then
    return 'not_member';
  end if;
  if not private.phone_signed_in(p_uid) then
    return 'not_member';
  end if;
  select u.created_at into v_created from auth.users u where u.id = p_uid;
  v_keys := private.identity_keys(p_uid);

  if v_profile.blocked_at is not null then
    return 'blocked';
  end if;
  if cardinality(v_keys) > 0 and exists (
    select 1 from public.identity_retention ir
    join public.profiles op on op.user_id = ir.user_id
    where ir.identity_key = any(v_keys) and ir.user_id <> p_uid and ir.purge_after > now() and op.blocked_at is not null
  ) then
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
  if cardinality(v_keys) > 0 and exists (
    select 1 from public.identity_retention ir
    join public.reviews r on r.reviewer_id = ir.user_id
    where ir.identity_key = any(v_keys) and ir.user_id <> p_uid and ir.purge_after > now()
      and r.provider_id = p_provider and r.status = 'removed'
      and r.removal_reason is distinct from 'Reviewer deleted their account'
  ) then
    return 'removed_before';
  end if;
  if v_created > now() - interval '24 hours'
     and exists (select 1 from public.reviews where reviewer_id = p_uid) then
    return 'new_account_limit';
  end if;
  return null;
end;
$$;
revoke execute on function private.review_block_reason(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- delete_my_account (000016 body + keys)
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
  if exists (select 1 from public.profiles where user_id = v_uid and role = 'admin') then
    raise exception 'admin_account';
  end if;

  delete from public.phone_retention where purge_after < now();
  delete from public.identity_retention where purge_after < now();

  select nullif(btrim(u.phone), '') into v_phone from auth.users u where u.id = v_uid;
  if v_phone is not null and not exists (select 1 from public.phone_retention r where r.user_id = v_uid) then
    insert into public.phone_retention (user_id, phone_e164) values (v_uid, '+' || ltrim(v_phone, '+'));
  end if;
  -- The hashed sign-in keys, while the account still has them (GoTrue's soft delete obfuscates them next).
  insert into public.identity_retention (user_id, identity_key)
  select v_uid, k from unnest(private.identity_keys(v_uid)) k
  where not exists (select 1 from public.identity_retention ir where ir.user_id = v_uid and ir.identity_key = k);

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

-- ---------------------------------------------------------------- wrong-code limiter (+ identity purge)
create or replace function private.code_verify_gate(p_subject text, p_ip_hash text)
returns table (attempt_id bigint, verdict text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_limits jsonb;
  v_n int;
  v_i int;
  v_verdict text := 'ok';
  v_id bigint;
begin
  -- Subject lock first, then IP, always in that order (no deadlocks between concurrent checks).
  perform pg_advisory_xact_lock(hashtext('otp_verify:phone:' || coalesce(p_subject, '')));
  perform pg_advisory_xact_lock(hashtext('otp_verify:ip:' || coalesce(p_ip_hash, '')));
  delete from public.otp_verify_attempts where created_at < now() - interval '1 day';
  -- Deleted people's numbers and sign-in keys go after 12 months, on every code check.
  delete from public.phone_retention where purge_after < now();
  delete from public.identity_retention where purge_after < now();

  select value into v_limits from public.settings where key = 'otp_verify_limits';
  v_limits := coalesce(v_limits, '{}'::jsonb);

  select count(*) into v_n from public.otp_verify_attempts
  where phone_e164 = p_subject and outcome in ('pending', 'wrong') and created_at > now() - interval '15 minutes';
  select count(*) into v_i from public.otp_verify_attempts
  where ip_hash = p_ip_hash and outcome in ('pending', 'wrong') and created_at > now() - interval '1 hour';

  if v_n >= coalesce((v_limits ->> 'number_15m')::int, 5) then
    v_verdict := 'subject_locked';
  elsif v_i >= coalesce((v_limits ->> 'ip_1h')::int, 20) then
    v_verdict := 'ip_locked';
  end if;

  insert into public.otp_verify_attempts (phone_e164, ip_hash, outcome)
  values (coalesce(p_subject, ''), coalesce(p_ip_hash, ''), case when v_verdict = 'ok' then 'pending' else 'locked' end)
  returning id into v_id;
  return query select v_id, v_verdict;
end;
$$;
revoke execute on function private.code_verify_gate(text, text) from public, anon, authenticated;
