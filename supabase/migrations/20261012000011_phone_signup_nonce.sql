-- Final review C1: bind every new phone account to one sign-in request made through the app.
--
-- Before: the auth.users guard accepted any insert for a number with an approved/sent otp_requests row in
-- the last 15 minutes. GoTrue's public /signup endpoint takes a phone AND a password, so anyone racing the
-- app's own signInWithOtp (or arriving within 15 minutes of a send) could create, or pre-plant a password
-- on, an account for a number they never received a text on.
--
-- Now:
--   * requestCode mints a random single-use nonce, stores only its sha256 on the approved row
--     (otp_approve, the only way to approve) and passes the nonce to GoTrue in the sign-up metadata;
--   * the guard accepts a phone insert only with a matching, approved, unconsumed row from the last
--     15 minutes, marks it consumed and strips the nonce from the metadata;
--   * an insert that arrives already confirmed (autoconfirm: phone confirmations switched off) is refused,
--     so a code sent to the phone is always needed;
--   * a phone-only account never holds a usable password: whatever GoTrue stored is replaced with a random
--     bcrypt hash on insert, on phone confirmation and on any later password change;
--   * changing an account's number is refused (the app has no such feature; deletion still obfuscates it).
-- Re-runnable.

alter table public.otp_requests add column if not exists nonce_hash text;
alter table public.otp_requests add column if not exists consumed_at timestamptz;
create unique index if not exists otp_requests_nonce_idx on public.otp_requests (nonce_hash) where nonce_hash is not null;

-- ---------------------------------------------------------------- otp_approve (service role only)
-- Marks a pending request approved (after the Lookup said "mobile") and binds it to the caller's nonce.
create or replace function public.otp_approve(p_request_id bigint, p_line_type text, p_nonce_hash text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_nonce_hash is null or p_nonce_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad nonce hash' using errcode = '22023';
  end if;
  update public.otp_requests
  set outcome = 'approved', line_type = coalesce(p_line_type, line_type), nonce_hash = p_nonce_hash
  where id = p_request_id and outcome = 'pending';
  if not found then
    raise exception 'request not pending' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function public.otp_approve(bigint, text, text) from public, anon, authenticated;
grant execute on function public.otp_approve(bigint, text, text) to service_role;

-- otp_record keeps recording every other outcome, but can no longer approve (an approval without a nonce
-- would be useless to the guard, and silently so).
create or replace function public.otp_record(p_request_id bigint, p_outcome text, p_line_type text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_outcome = 'approved' then
    raise exception 'approve with otp_approve' using errcode = '22023';
  end if;
  update public.otp_requests
  set outcome = p_outcome, line_type = coalesce(p_line_type, line_type)
  where id = p_request_id;
end;
$$;
revoke execute on function public.otp_record(bigint, text, text) from public, anon, authenticated;
grant execute on function public.otp_record(bigint, text, text) to service_role;

-- ---------------------------------------------------------------- random password hash
create or replace function private.random_password_hash() returns text
language sql volatile security definer set search_path = ''
as $$
  select extensions.crypt(encode(extensions.gen_random_bytes(32), 'base64'), extensions.gen_salt('bf'));
$$;
revoke execute on function private.random_password_hash() from public, anon, authenticated;

-- ---------------------------------------------------------------- auth.users guard (insert / phone change)
create or replace function private.guard_auth_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_e164 text;
  v_nonce text;
  v_request bigint;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Only fired for UPDATE OF phone. Keeping the same number is fine; anything else is refused.
    if new.phone is not distinct from old.phone or coalesce(new.phone, '') = coalesce(old.phone, '') then
      return new;
    end if;
    raise exception 'phone changes are not supported' using errcode = 'check_violation';
  end if;

  if coalesce(new.phone, '') <> '' then
    v_e164 := '+' || ltrim(new.phone, '+');
    v_nonce := nullif(new.raw_user_meta_data ->> 'bv_nonce', '');
    if v_nonce is not null then
      select r.id into v_request
      from public.otp_requests r
      where r.phone_e164 = v_e164
        and r.outcome = 'approved'
        and r.consumed_at is null
        and r.nonce_hash = encode(sha256(convert_to(v_nonce, 'UTF8')), 'hex')
        and r.created_at > now() - interval '15 minutes'
      for update;
    end if;
    if v_request is null then
      raise exception 'phone sign-up not approved' using errcode = 'check_violation';
    end if;
    if new.phone_confirmed_at is not null then
      raise exception 'phone sign-up must be confirmed by code' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from auth.users u
      where u.id <> new.id and u.deleted_at is null and ltrim(u.phone, '+') = ltrim(new.phone, '+')
    ) then
      raise exception 'phone already registered' using errcode = 'unique_violation';
    end if;

    update public.otp_requests set consumed_at = now() where id = v_request;
    new.raw_user_meta_data := new.raw_user_meta_data - 'bv_nonce';
    if coalesce(new.email, '') = '' then
      new.encrypted_password := private.random_password_hash();
    end if;
  elsif coalesce(new.email, '') <> '' then
    if not exists (
      select 1 from public.settings s, jsonb_array_elements_text(s.value) e
      where s.key = 'admin_emails' and jsonb_typeof(s.value) = 'array' and lower(e) = lower(new.email)
    ) then
      raise exception 'email sign-ups are disabled' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_auth_user() from public, anon, authenticated;

drop trigger if exists bv_guard_auth_user_insert on auth.users;
create trigger bv_guard_auth_user_insert
  before insert on auth.users
  for each row execute function private.guard_auth_user();
drop trigger if exists bv_guard_auth_user_phone on auth.users;
create trigger bv_guard_auth_user_phone
  before update of phone on auth.users
  for each row execute function private.guard_auth_user();

-- ---------------------------------------------------------------- auth.users scrub (every update)
-- Phone-only accounts sign in by code only: a password set before the phone is confirmed, when it is
-- confirmed, or later, is replaced with a random one. The sign-up nonce never stays in the metadata.
create or replace function private.scrub_auth_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'bv_nonce' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'bv_nonce';
  end if;
  if new.deleted_at is null and coalesce(new.phone, '') <> '' and coalesce(new.email, '') = '' and (
       (old.phone_confirmed_at is null and new.phone_confirmed_at is not null)
       or new.encrypted_password is distinct from old.encrypted_password
     ) then
    new.encrypted_password := private.random_password_hash();
  end if;
  return new;
end;
$$;
revoke execute on function private.scrub_auth_user() from public, anon, authenticated;

drop trigger if exists bv_scrub_auth_user on auth.users;
create trigger bv_scrub_auth_user
  before update on auth.users
  for each row execute function private.scrub_auth_user();
