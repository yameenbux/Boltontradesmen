-- Launch checklist: "Get listed" requests from the public form at /get-listed (until now: email or WhatsApp only).
--
-- * public.listing_requests: one row per request (business, contact name, trade, area, phone, optional email and
--   message, a keyed hash of the sender's connection). RLS on, no policies, no grants (not even the service role):
--   rows are only written and read through the functions below.
-- * public.submit_listing_request(...): service role only (the form's server action). Trims and checks the input
--   ('invalid'), then the limits ('limited'): 3 per connection in 24 hours, 2 per phone number in 7 days, 50 a day
--   site-wide (Bolton's day). Otherwise stores the request and answers 'ok'.
-- * public.admin_list_listing_requests(status) / public.admin_set_listing_request_status(id, status): the admin's
--   Requests page. is_admin() checked; a status change writes one audit_log row.
-- * public.admin_counts(): gains "listing_requests" (new requests waiting), for the admin nav and dashboard.
-- * Retention: a request holds personal data, so it's deleted 90 days after it was sent, whatever its status (the
--   privacy notice says so). private.tidy_listing_requests() does it. It runs on every submission and, so it also
--   happens when nobody submits, inside private.tidy_sign_in_records() (migration 000023), which email_gate already
--   runs at most once an hour and the admin can run from the dashboard. That function is re-created here with the
--   same body plus the new count; keep the two in step if either changes.
-- Re-runnable.

-- ---------------------------------------------------------------- the table
create table if not exists public.listing_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  business_name text not null check (char_length(business_name) between 1 and 80),
  contact_name text not null check (char_length(contact_name) between 1 and 60),
  trade text not null check (char_length(trade) between 1 and 60),
  area text check (area is null or char_length(area) between 1 and 60),
  -- UK numbers in E.164, the same shape as providers.phone_e164.
  phone_e164 text not null check (phone_e164 ~ '^\+44[0-9]{9,10}$'),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  message text check (message is null or char_length(message) between 1 and 500),
  ip_hash text,
  status text not null default 'new' check (status in ('new', 'done', 'spam')),
  handled_at timestamptz
);
create index if not exists listing_requests_created_at_idx on public.listing_requests (created_at);
create index if not exists listing_requests_ip_idx on public.listing_requests (ip_hash, created_at);
create index if not exists listing_requests_phone_idx on public.listing_requests (phone_e164, created_at);
create index if not exists listing_requests_status_idx on public.listing_requests (status, created_at);
alter table public.listing_requests enable row level security;
revoke all on public.listing_requests from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- retention (90 days)
create or replace function private.tidy_listing_requests() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v int;
begin
  delete from public.listing_requests where created_at < now() - interval '90 days';
  get diagnostics v = row_count;
  return v;
end;
$$;
revoke execute on function private.tidy_listing_requests() from public, anon, authenticated, service_role;

-- Same body as migration 000023, plus listing requests.
create or replace function private.tidy_sign_in_records() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email int;
  v_phone int;
  v_attempts int;
  v_accounts int;
  v_listing int;
begin
  delete from public.email_requests where created_at < now() - interval '30 days';
  get diagnostics v_email = row_count;
  delete from public.otp_requests where created_at < now() - interval '30 days';
  get diagnostics v_phone = row_count;
  delete from public.otp_verify_attempts where created_at < now() - interval '30 days';
  get diagnostics v_attempts = row_count;
  -- Their identities and sessions go with them (auth's own cascades); they have no profile, so nothing else does.
  delete from auth.users u
  where u.id in (
    select a.id from auth.users a
    where a.deleted_at is null
      and a.created_at < now() - interval '24 hours'
      and private.abandoned_email_account(a.id)
      and not exists (select 1 from public.reviews r where r.reviewer_id = a.id)
    order by a.created_at
    limit 500
  );
  get diagnostics v_accounts = row_count;
  v_listing := private.tidy_listing_requests();
  update private.housekeeping set last_run = now() where job = 'tidy_sign_in_records';
  return jsonb_build_object('email_requests', v_email, 'phone_requests', v_phone, 'code_attempts', v_attempts,
                            'unused_accounts', v_accounts, 'listing_requests', v_listing);
end;
$$;
revoke execute on function private.tidy_sign_in_records() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- submit (the public form, via the server)
create or replace function public.submit_listing_request(
  p_business_name text, p_contact_name text, p_trade text, p_area text, p_phone_e164 text, p_email text,
  p_message text, p_ip_hash text
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_business text := nullif(btrim(coalesce(p_business_name, '')), '');
  v_name text := nullif(btrim(coalesce(p_contact_name, '')), '');
  v_trade text := nullif(btrim(coalesce(p_trade, '')), '');
  v_area text := nullif(btrim(coalesce(p_area, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone_e164, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_ip text := coalesce(nullif(btrim(p_ip_hash), ''), 'unknown');
  v_day_start timestamptz;
begin
  if v_business is null or char_length(v_business) > 80
     or v_name is null or char_length(v_name) > 60
     or v_trade is null or char_length(v_trade) > 60
     or char_length(coalesce(v_area, '')) > 60
     or v_phone is null or v_phone !~ '^\+44[0-9]{9,10}$'
     or (v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
     or char_length(coalesce(v_message, '')) > 500 then
    return 'invalid';
  end if;

  -- One request at a time, so concurrent ones can't overshoot the limits.
  perform pg_advisory_xact_lock(hashtext('listing_requests'));
  perform private.tidy_listing_requests();

  v_day_start := date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London';
  if (select count(*) from public.listing_requests where ip_hash = v_ip and created_at > now() - interval '24 hours') >= 3
     or (select count(*) from public.listing_requests where phone_e164 = v_phone and created_at > now() - interval '7 days') >= 2
     or (select count(*) from public.listing_requests where created_at >= v_day_start) >= 50 then
    return 'limited';
  end if;

  insert into public.listing_requests (business_name, contact_name, trade, area, phone_e164, email, message, ip_hash)
  values (v_business, v_name, v_trade, v_area, v_phone, v_email, v_message, v_ip);
  return 'ok';
end;
$$;
revoke execute on function public.submit_listing_request(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_listing_request(text, text, text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------- admin
-- p_status: 'new', 'done' or 'spam'; null for all. Newest first, at most 200.
create or replace function public.admin_list_listing_requests(p_status text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('new', 'done', 'spam') then
    raise exception 'status must be new, done or spam' using errcode = 'check_violation';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'created_at', r.created_at, 'business_name', r.business_name, 'contact_name', r.contact_name,
      'trade', r.trade, 'area', r.area, 'phone_e164', r.phone_e164, 'email', r.email, 'message', r.message,
      'status', r.status, 'handled_at', r.handled_at) order by r.created_at desc, r.id)
    from (
      select * from public.listing_requests
      where p_status is null or status = p_status
      order by created_at desc, id
      limit 200
    ) r
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_listing_request_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not admin' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('new', 'done', 'spam') then
    raise exception 'status must be new, done or spam' using errcode = 'check_violation';
  end if;
  update public.listing_requests
  set status = p_status, handled_at = case when p_status = 'new' then null else now() end
  where id = p_id;
  if not found then
    raise exception 'listing request not found' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor_id, action, target_type, target_id, reason)
  values (auth.uid(), 'set_listing_request_status', 'listing_request', p_id::text, p_status);
end;
$$;

-- Same as migration 000021, plus new listing requests.
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
    'listing_requests', (select count(*) from public.listing_requests where status = 'new')
  );
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_list_listing_requests(text)',
    'public.admin_set_listing_request_status(uuid, text)',
    'public.admin_counts()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
