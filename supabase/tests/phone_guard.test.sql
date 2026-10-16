-- The auth.users guard binds every new phone account to one sign-in request made through the app:
-- the server action mints a single-use nonce, stores only its hash on the approved otp_requests row
-- (otp_approve) and hands the nonce to GoTrue in the sign-up metadata. The guard accepts an insert only
-- with a matching, unconsumed, approved, recent row, consumes it, strips the nonce, and makes sure a
-- phone-only account never holds a usable password. GoTrue's inserts are simulated here as postgres.
begin;
select plan(40);

-- helpers --------------------------------------------------------------------------------------------
-- An app request for p_phone, approved with the nonce p_nonce (what requestCode does before signInWithOtp).
create function pg_temp.approve(p_phone text, p_nonce text) returns bigint language plpgsql as $$
declare v_id bigint;
begin
  select request_id into v_id from public.otp_gate(p_phone, 'pgtap-guard');
  perform public.otp_approve(v_id, 'mobile', encode(sha256(convert_to(p_nonce, 'UTF8')), 'hex'));
  return v_id;
end $$;
create function pg_temp.h(p text) returns text language sql as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
-- A sign-up as GoTrue would insert it (unconfirmed, with a bcrypt password hash).
create function pg_temp.signup(p_id uuid, p_phone text, p_meta jsonb, p_password text default 'attacker-pass-123',
                               p_confirmed timestamptz default null) returns void language sql as $$
  insert into auth.users (id, phone, raw_user_meta_data, encrypted_password, phone_confirmed_at)
  values (p_id, p_phone, p_meta, extensions.crypt(p_password, extensions.gen_salt('bf')), p_confirmed);
$$;
create function pg_temp.password_works(p_id uuid, p_password text) returns boolean language sql as $$
  select coalesce(u.encrypted_password, '') <> ''
     and extensions.crypt(p_password, u.encrypted_password) = u.encrypted_password
  from auth.users u where u.id = p_id;
$$;

-- ======================================================================== no app request, no account
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-00000000e001', '447700900421', '{}')$$,
  null, 'phone sign-up not approved', 'a sign-up for a number the app never approved is refused');

-- the reproduced attack: the app has approved the number, but the sign-up does not carry the app's nonce
select pg_temp.approve('+447700900421', 'nonce-421');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-00000000e001', '447700900421', '{}')$$,
  null, 'phone sign-up not approved', 'an approved number without the app''s nonce is refused (password /signup race)');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-00000000e001', '447700900421', '{"bv_nonce":"guessed"}')$$,
  null, 'phone sign-up not approved', 'a wrong nonce is refused');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-00000000e001', '447700900422', '{"bv_nonce":"nonce-421"}')$$,
  null, 'phone sign-up not approved', 'a nonce minted for one number cannot create another');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-00000000e001', '447700900421', '{"bv_nonce":"nonce-421"}', 'x', now())$$,
  null, 'phone sign-up must be confirmed by code', 'an already-confirmed (autoconfirm) phone sign-up is refused even with the nonce');
select is((select consumed_at from public.otp_requests where nonce_hash = pg_temp.h('nonce-421')), null,
  'refused attempts do not use up the nonce');

-- ======================================================================== the app's own sign-up
select lives_ok($$select pg_temp.signup('00000000-0000-0000-0000-00000000e001', '447700900421', '{"bv_nonce":"nonce-421","x":1}')$$,
  'the sign-up carrying the app''s nonce is accepted');
select isnt((select consumed_at from public.otp_requests where nonce_hash = pg_temp.h('nonce-421')), null,
  'the nonce is consumed');
select is((select raw_user_meta_data from auth.users where id = '00000000-0000-0000-0000-00000000e001'), '{"x":1}'::jsonb,
  'the nonce is stripped from the user metadata');
select is(pg_temp.password_works('00000000-0000-0000-0000-00000000e001', 'attacker-pass-123'), false,
  'a password supplied with a phone sign-up never works');
select matches((select encrypted_password from auth.users where id = '00000000-0000-0000-0000-00000000e001'), '^\$2[aby]\$',
  'the password is replaced with a random bcrypt hash (GoTrue still parses it)');

-- ======================================================================== single use
delete from auth.users where id = '00000000-0000-0000-0000-00000000e001';
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-00000000e002', '447700900421', '{"bv_nonce":"nonce-421"}')$$,
  null, 'phone sign-up not approved', 'a consumed nonce cannot be reused (e.g. after the account is deleted)');

-- only an approved row counts: once the app has recorded the send, the nonce is dead
select public.otp_record(pg_temp.approve('+447700900423', 'nonce-423'), 'sent', 'mobile');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-00000000e003', '447700900423', '{"bv_nonce":"nonce-423"}')$$,
  null, 'phone sign-up not approved', 'a row already marked sent is not accepted');

-- a 'sent' row for the number (the old 15-minute window) does not approve anything any more
insert into public.otp_requests (phone_e164, ip_hash, outcome) values ('+447700900424', 'pgtap-guard', 'sent');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-00000000e004', '447700900424', '{}')$$,
  null, 'phone sign-up not approved', 'a recent sent row without a nonce is refused');

-- too old
select pg_temp.approve('+447700900425', 'nonce-425');
update public.otp_requests set created_at = now() - interval '16 minutes' where nonce_hash = pg_temp.h('nonce-425');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-00000000e005', '447700900425', '{"bv_nonce":"nonce-425"}')$$,
  null, 'phone sign-up not approved', 'an approval 16 minutes old is too old');

-- a still-pending row (Lookup not done) has no nonce and approves nothing
select request_id from public.otp_gate('+447700900426', 'pgtap-guard');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-00000000e006', '447700900426', '{"bv_nonce":""}')$$,
  null, 'phone sign-up not approved', 'an empty nonce against a pending row is refused');

-- ======================================================================== approvals need a nonce
set local role service_role;
select throws_ok($$select public.otp_record((select max(id) from public.otp_requests where phone_e164 = '+447700900426'), 'approved', 'mobile')$$,
  null, 'approve with otp_approve', 'otp_record cannot approve (no nonce)');
select throws_ok($$select public.otp_approve((select max(id) from public.otp_requests where phone_e164 = '+447700900426'), 'mobile', 'not-a-hash')$$,
  null, 'bad nonce hash', 'otp_approve needs a sha256 hex hash');
select lives_ok($$select public.otp_approve((select max(id) from public.otp_requests where phone_e164 = '+447700900426'), 'mobile', repeat('a', 64))$$,
  'otp_approve approves a pending row');
select throws_ok($$select public.otp_approve((select max(id) from public.otp_requests where phone_e164 = '+447700900426'), 'mobile', repeat('b', 64))$$,
  null, 'request not pending', 'a row can be approved only once');
reset role;
select is((select outcome || '/' || line_type || '/' || nonce_hash from public.otp_requests where phone_e164 = '+447700900426'),
  'approved/mobile/' || repeat('a', 64), 'otp_approve stores the outcome, line type and nonce hash');
set local role anon;
select throws_ok($$select public.otp_approve(1, 'mobile', repeat('a', 64))$$, '42501', null, 'anon cannot call otp_approve');
reset role;
set local role authenticated;
select throws_ok($$select public.otp_approve(1, 'mobile', repeat('a', 64))$$, '42501', null, 'authenticated cannot call otp_approve');
reset role;

-- ======================================================================== two accounts, one number
select pg_temp.approve('+447700900427', 'nonce-427a');
select pg_temp.signup('00000000-0000-0000-0000-00000000e007', '447700900427', '{"bv_nonce":"nonce-427a"}');
select pg_temp.approve('+447700900427', 'nonce-427b');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-00000000e008', '447700900427', '{"bv_nonce":"nonce-427b"}')$$,
  null, 'phone already registered', 'a second account for the same number is refused');

-- ======================================================================== no usable password, ever
-- before the code is entered: a password set on the unconfirmed account is scrubbed
update auth.users set encrypted_password = extensions.crypt('attacker-pass-123', extensions.gen_salt('bf'))
where id = '00000000-0000-0000-0000-00000000e007';
select is(pg_temp.password_works('00000000-0000-0000-0000-00000000e007', 'attacker-pass-123'), false,
  'a password set before the phone is confirmed is scrubbed');
-- the owner confirms the phone with their code: whatever hash was there is replaced again
create temp table before_confirm as select encrypted_password from auth.users where id = '00000000-0000-0000-0000-00000000e007';
update auth.users set phone_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000e007';
select isnt((select encrypted_password from auth.users where id = '00000000-0000-0000-0000-00000000e007'),
  (select encrypted_password from before_confirm), 'confirming the phone replaces the password hash');
select matches((select encrypted_password from auth.users where id = '00000000-0000-0000-0000-00000000e007'), '^\$2[aby]\$',
  'with a fresh random bcrypt hash');
-- after confirmation too: phone-only accounts sign in by code only
update auth.users set encrypted_password = extensions.crypt('later-pass-123', extensions.gen_salt('bf'))
where id = '00000000-0000-0000-0000-00000000e007';
select is(pg_temp.password_works('00000000-0000-0000-0000-00000000e007', 'later-pass-123'), false,
  'a password set on a confirmed phone-only account is scrubbed');
select lives_ok($$update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-00000000e007'$$,
  'ordinary updates (sign-in time) still work');
select is((select raw_user_meta_data ? 'bv_nonce' from auth.users where id = '00000000-0000-0000-0000-00000000e007'), false,
  'no nonce in the metadata');
update auth.users set raw_user_meta_data = '{"bv_nonce":"x","k":2}' where id = '00000000-0000-0000-0000-00000000e007';
select is((select raw_user_meta_data from auth.users where id = '00000000-0000-0000-0000-00000000e007'), '{"k":2}'::jsonb,
  'a nonce written back by a later update is stripped');

-- email (admin) accounts keep their passwords
update public.settings set value = '["guard-admin@example.com"]'::jsonb where key = 'admin_emails';
insert into auth.users (id, email, encrypted_password)
values ('00000000-0000-0000-0000-00000000e009', 'guard-admin@example.com', extensions.crypt('admin-pass-123', extensions.gen_salt('bf')));
update auth.users set encrypted_password = extensions.crypt('admin-pass-456', extensions.gen_salt('bf'))
where id = '00000000-0000-0000-0000-00000000e009';
select is(pg_temp.password_works('00000000-0000-0000-0000-00000000e009', 'admin-pass-456'), true,
  'an admin email account keeps its password');
select throws_ok($$insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000e00a', 'nobody@example.com')$$,
  null, 'email sign-up not approved', 'an email-only account not on the allow-list, without the app''s nonce, is still refused');
select lives_ok($$insert into auth.users (id) values ('00000000-0000-0000-0000-00000000e00b')$$,
  'a bare id (test fixtures) is still accepted');

-- ======================================================================== phone changes
select lives_ok($$update auth.users set phone = phone, updated_at = now() where id = '00000000-0000-0000-0000-00000000e007'$$,
  'an update that keeps the same phone is allowed');
select pg_temp.approve('+447700900428', 'nonce-428');
select throws_ok($$update auth.users set phone = '447700900428' where id = '00000000-0000-0000-0000-00000000e007'$$,
  null, 'phone changes are not supported', 'changing an account''s number is refused, even to an approved number');
select throws_ok($$update auth.users set phone = '447700900429' where id = '00000000-0000-0000-0000-00000000e009'$$,
  null, 'phone changes are not supported', 'adding a number to an email account is refused');
select lives_ok($$update auth.users set deleted_at = now(), phone = 'deleted-0f3a' where id = '00000000-0000-0000-0000-00000000e007'$$,
  'soft delete with an obfuscated phone is allowed');

-- the guard and scrub functions are not callable through the API
select is(has_function_privilege('anon', 'private.guard_auth_user()', 'execute'), false, 'anon cannot execute the guard');
select is(has_function_privilege('authenticated', 'private.scrub_auth_user()', 'execute'), false, 'authenticated cannot execute the scrub');

select * from finish();
rollback;
