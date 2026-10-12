-- Phone accounts: OTP gate and limits, the auth.users guard, onboarding and provider linking.
begin;
select plan(51);

-- ======================================================================== otp_gate limits
set local role service_role;
select is((select verdict from public.otp_gate('+447700900401', 'ip-a')), 'ok', 'number: 1st request ok');
select is((select verdict from public.otp_gate('+447700900401', 'ip-a2')), 'ok', 'number: 2nd request ok');
select is((select verdict from public.otp_gate('+447700900401', 'ip-a3')), 'ok', 'number: 3rd request ok');
select is((select verdict from public.otp_gate('+447700900401', 'ip-a4')), 'number_limited', 'number: 4th request in 15 minutes is limited');
reset role;
select is((select outcome from public.otp_requests where phone_e164 = '+447700900401' order by id desc limit 1),
  'limited_number', 'the limited request is recorded with its outcome');
-- 24-hour limit per number: 6 (earlier rows of any outcome count)
update public.otp_requests set created_at = now() - interval '1 hour' where phone_e164 = '+447700900401';
insert into public.otp_requests (phone_e164, ip_hash, created_at)
select '+447700900401', 'ip-old', now() - interval '2 hours' from generate_series(1, 2);
set local role service_role;
select is((select verdict from public.otp_gate('+447700900401', 'ip-a5')), 'number_limited', 'number: 7th request in 24 hours is limited');
reset role;

create temp table ipv (n int, verdict text);
grant all on ipv to service_role;
set local role service_role;
insert into ipv select n, (select verdict from public.otp_gate('+4477009005' || lpad(n::text, 2, '0'), 'ip-b')) from generate_series(10, 19) n;
select is((select count(*)::int from ipv where verdict = 'ok'), 10, 'IP: 10 requests across numbers are ok');
select is((select verdict from public.otp_gate('+447700900520', 'ip-b')), 'ip_limited', 'IP: 11th request in an hour is limited');
reset role;

-- monthly SMS cap: £20 at £0.10 per sent code (Lookups priced at 0 here; owner_decisions.test.sql covers them)
update public.settings set value = '0'::jsonb where key = 'lookup_cost_gbp';
insert into public.otp_requests (phone_e164, ip_hash, outcome)
select '+4477009006' || lpad((n % 100)::text, 2, '0'), 'bulk', 'sent' from generate_series(1, 199) n;
insert into public.otp_requests (phone_e164, ip_hash, outcome, created_at)
values ('+447700900699', 'bulk-old', 'sent',
  (date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London') - interval '1 day');
set local role service_role;
select is((select verdict from public.otp_gate('+447700900402', 'ip-c')), 'ok', 'cap: 199 sent this month (plus one last month) is under £20');
reset role;
insert into public.otp_requests (phone_e164, ip_hash, outcome) values ('+447700900698', 'bulk', 'sent');
set local role service_role;
select is((select verdict from public.otp_gate('+447700900402', 'ip-c')), 'cap_reached', 'cap: 200 sent this month at £0.10 reaches £20');
reset role;
select is((select outcome from public.otp_requests where phone_e164 = '+447700900402' order by id desc limit 1),
  'cap_reached', 'the capped request is recorded');

-- retention: rows older than 30 days are deleted by the next call
delete from public.otp_requests where outcome = 'sent';
insert into public.otp_requests (phone_e164, ip_hash, created_at) values ('+447700900697', 'ancient', now() - interval '31 days');
set local role service_role;
select is((select verdict from public.otp_gate('+447700900696', 'ip-d')), 'ok', 'gate ok after the cap rows are gone');
reset role;
select is((select count(*)::int from public.otp_requests where ip_hash = 'ancient'), 0, 'rows older than 30 days are purged');

-- otp_record
set local role service_role;
select lives_ok($$select public.otp_record((select max(id) from public.otp_requests where phone_e164 = '+447700900696'), 'voip', 'nonFixedVoip')$$,
  'otp_record runs as service_role');
reset role;
select is((select outcome || '/' || line_type from public.otp_requests where phone_e164 = '+447700900696'), 'voip/nonFixedVoip', 'otp_record stores outcome and line type');

-- not callable by anon or authenticated
set local role anon;
select throws_ok($$select * from public.otp_gate('+447700900401', 'x')$$, '42501', null, 'anon cannot call otp_gate');
select throws_ok($$select public.otp_record(1, 'sent', null)$$, '42501', null, 'anon cannot call otp_record');
reset role;
set local role authenticated;
select throws_ok($$select * from public.otp_gate('+447700900401', 'x')$$, '42501', null, 'authenticated cannot call otp_gate');
select throws_ok($$select public.otp_record(1, 'sent', null)$$, '42501', null, 'authenticated cannot call otp_record');
select throws_ok($$select count(*) from public.otp_requests$$, '42501', null, 'authenticated cannot read otp_requests');
reset role;

-- ======================================================================== auth.users guard
-- The full guard rules (nonce binding, single use, passwords, phone changes) are in phone_guard.test.sql.
select throws_ok(
  $$insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000007a1', '447700900403')$$,
  null, 'phone sign-up not approved', 'phone sign-up without an approved request is refused');
set local role service_role;
select public.otp_approve(g.request_id, 'mobile', encode(sha256(convert_to('acc-nonce-403', 'UTF8')), 'hex'))
from public.otp_gate('+447700900403', 'ip-g') g;
reset role;
select throws_ok(
  $$insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000007a1', '447700900403')$$,
  null, 'phone sign-up not approved', 'an approved request alone (no nonce) is not enough');
select lives_ok(
  $$insert into auth.users (id, phone, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000007a1', '447700900403', '{"bv_nonce":"acc-nonce-403"}')$$,
  'phone sign-up carrying the approved request''s nonce succeeds');

select throws_ok(
  $$insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000007a4', 'x@example.com')$$,
  null, 'email sign-up not approved', 'an email-only account without the app''s nonce is refused');
update public.settings set value = '["x@example.com"]'::jsonb where key = 'admin_emails';
select lives_ok(
  $$insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000007a4', 'X@Example.com')$$,
  'an allow-listed admin email (any case) is accepted');
select lives_ok(
  $$insert into auth.users (id) values ('00000000-0000-0000-0000-0000000007a5')$$,
  'a bare id (test fixtures) is accepted');
select lives_ok(
  $$update auth.users set deleted_at = now(), phone = 'deleted-0f3a' where id = '00000000-0000-0000-0000-0000000007a1'$$,
  'soft delete with an obfuscated phone is allowed');

-- ======================================================================== onboarding
-- helper users: a 'sent' request, then the account (as GoTrue would create it)
insert into public.otp_requests (phone_e164, ip_hash, outcome, line_type) values
  ('+447700900405', 't', 'sent', 'mobile'),
  ('+447700900406', 't', 'sent', 'mobile'),
  ('+447700900301', 't', 'sent', 'mobile');
-- each account as the app's sign-up creates it: an approved request bound to a nonce, then the insert
insert into public.otp_requests (phone_e164, ip_hash, outcome, nonce_hash)
select p, 't', 'approved', encode(sha256(convert_to('n' || p, 'UTF8')), 'hex')
from unnest(array['+447700900405', '+447700900406', '+447700900301']) p;
insert into auth.users (id, phone, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007b1', '447700900405', '{"bv_nonce":"n+447700900405"}'),  -- Sarah
  ('00000000-0000-0000-0000-0000000007b2', '447700900406', '{"bv_nonce":"n+447700900406"}'),  -- admin with a phone
  ('00000000-0000-0000-0000-0000000007b3', '447700900301', '{"bv_nonce":"n+447700900301"}');  -- Ace's listing number
insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-0000000007b2', 'admin');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000007b1","role":"authenticated"}';
select is(public.my_account(), null, 'my_account is null before onboarding');
select is(public.complete_onboarding('Sarah K.', 'BL3', 'nope') ->> 'error', 'bad_group_code', 'a wrong group code is refused');
select throws_ok($$select public.complete_onboarding('Sarah', 'BL3', '')$$, '23514', null, 'a name without an initial is refused');
select throws_ok($$select public.complete_onboarding('Sarah K.', 'Bolton', '')$$, '23514', null, 'a district that is not a postcode district is refused');
select is(public.complete_onboarding('Sarah K.', 'BL3', 'bolton ') ->> 'display_name', 'Sarah K.', 'onboarding returns my_account');
reset role;
select is((select role::text from public.profiles where user_id = '00000000-0000-0000-0000-0000000007b1'), 'resident', 'new profile is a resident');
select isnt((select group_member_at from public.profiles where user_id = '00000000-0000-0000-0000-0000000007b1'), null, 'the group code sets group_member_at');
select is((select line_type from public.profiles where user_id = '00000000-0000-0000-0000-0000000007b1'), 'mobile', 'line type copied from the sent request');
select isnt((select line_type_checked_at from public.profiles where user_id = '00000000-0000-0000-0000-0000000007b1'), null, 'line type check time copied');
set local role authenticated;
select is((public.my_account() ->> 'group_member')::boolean, true, 'my_account shows group membership');
select lives_ok($$select public.complete_onboarding('Sarah K.', 'OTHER', '')$$, 'district OTHER is accepted');
reset role;
select isnt((select group_member_at from public.profiles where user_id = '00000000-0000-0000-0000-0000000007b1'), null,
  'a blank group code later keeps the membership');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000007b2","role":"authenticated"}';
select is(public.complete_onboarding('Ada A.', 'BL1', '') ->> 'role', 'admin', 'an existing admin keeps role admin');
select is(public.set_group_code('nope'), false, 'set_group_code: wrong code is false');
select is(public.set_group_code(' Bolton'), true, 'set_group_code: right code is true');
reset role;
select isnt((select group_member_at from public.profiles where user_id = '00000000-0000-0000-0000-0000000007b2'), null, 'set_group_code sets group_member_at');

set local role anon;
select throws_ok($$select public.my_account()$$, '42501', null, 'anon cannot call my_account');
reset role;

-- ======================================================================== provider linking
insert into public.providers (id, slug, business_name, phone_e164, whatsapp_e164, status, consent_at, consent_evidence) values
  ('00000000-0000-0000-0000-0000000007c1', 'acc-live', 'Acc Live', '+447700900399', '+447700900301', 'live', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000007c2', 'acc-removed', 'Acc Removed', '+447700900301', null, 'removed', now(), '{}'::jsonb);
insert into public.providers (id, slug, business_name, phone_e164, status) values
  ('00000000-0000-0000-0000-0000000007c3', 'acc-invited', 'Acc Invited', '+447700900301', 'invited');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000007b3","role":"authenticated"}';
select is(public.complete_onboarding('Alan A.', 'BL1', '') -> 'providers' -> 0 ->> 'slug', 'acc-live',
  'my_account lists the linked listing');
select is(jsonb_array_length(public.my_account() -> 'providers'), 1, 'only the live listing is linked');
select is(public.my_account() ->> 'role', 'provider', 'the linked user becomes a provider');
reset role;
select is((select count(*)::int from public.audit_log where action = 'claim_provider' and actor_id = '00000000-0000-0000-0000-0000000007b3'),
  1, 'one claim_provider audit row');
select is((select count(*)::int from public.providers where id in ('00000000-0000-0000-0000-0000000007c2', '00000000-0000-0000-0000-0000000007c3')
  and user_id is not null), 0, 'invited and removed listings are not linked');

update public.providers set phone_e164 = '+447700900398' where id = '00000000-0000-0000-0000-0000000007c1';
select is((select user_id from public.providers where id = '00000000-0000-0000-0000-0000000007c1'),
  '00000000-0000-0000-0000-0000000007b3'::uuid, 'changing the other number keeps the link');
update public.providers set phone_e164 = '+447700900397', whatsapp_e164 = '+447700900396' where id = '00000000-0000-0000-0000-0000000007c1';
select is((select user_id from public.providers where id = '00000000-0000-0000-0000-0000000007c1'), null,
  'changing both numbers away from the user''s phone unlinks the listing');

select * from finish();
rollback;
