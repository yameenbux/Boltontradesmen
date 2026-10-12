-- Plan 2b Task 3: email-code and Google accounts in the database.
-- * email_gate: the database half of "Email me a code" (format, admin addresses, disposable domains, an
--   address already used in another form, per-address and per-IP limits, the Resend free-tier caps);
--   email_approve binds the approved request to the app's single-use nonce; email_record logs the send.
-- * the auth.users guard: a new email account needs that nonce (and arrives unconfirmed, on an allowed
--   domain, with an address nobody else holds); Google inserts are accepted unless the normalised email is
--   taken; password sign-ups are refused; the admin allow-list is unchanged.
-- * the scrub: no usable password on any non-admin account; email changes refused for non-admins.
-- * sign_in_kind, email_verify_gate (wrong-code limits shared with phone), my_account's new fields.
-- GoTrue's inserts are simulated here as postgres.
begin;
select plan(87);

update public.settings set value = '["bv-admin@example.com"]'::jsonb where key = 'admin_emails';

-- helpers --------------------------------------------------------------------------------------------
create function pg_temp.gate(p_email text, p_ip text) returns text language sql as $$
  select verdict from public.email_gate(p_email, p_ip)
$$;
create function pg_temp.h(p text) returns text language sql as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
-- An approved request for p_email bound to p_nonce, p_age ago (what requestEmailSignInCode leaves behind).
create function pg_temp.approved(p_email text, p_nonce text, p_age interval default '0 minutes') returns bigint
language sql as $$
  insert into public.email_requests (email_norm, ip_hash, outcome, nonce_hash, created_at)
  values (private.normalise_email(p_email), 'pgtap-guard', 'approved', pg_temp.h(p_nonce), now() - p_age)
  returning id
$$;
-- A sign-up as GoTrue would insert it: unconfirmed, app metadata naming the provider, a bcrypt password.
create function pg_temp.signup(p_id uuid, p_email text, p_meta jsonb, p_provider text default 'email',
                               p_password text default 'attacker-pass-123', p_confirmed timestamptz default null)
returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, email_confirmed_at)
  values (p_id, p_email, p_meta, jsonb_build_object('provider', p_provider, 'providers', jsonb_build_array(p_provider)),
          case when p_password is null then null else extensions.crypt(p_password, extensions.gen_salt('bf')) end,
          p_confirmed);
$$;
create function pg_temp.password_works(p_id uuid, p_password text) returns boolean language sql as $$
  select coalesce(u.encrypted_password, '') <> ''
     and extensions.crypt(p_password, u.encrypted_password) = u.encrypted_password
  from auth.users u where u.id = p_id;
$$;
create function pg_temp.verify(p_email text, p_ip text, p_ok boolean) returns text language plpgsql as $$
declare v_id bigint; v_verdict text;
begin
  select attempt_id, verdict into v_id, v_verdict from public.email_verify_gate(p_email, p_ip);
  if v_verdict = 'ok' then perform public.otp_verify_record(v_id, p_ok); end if;
  return v_verdict;
end $$;
create function pg_temp.verify_phone(p_phone text, p_ip text, p_ok boolean) returns text language plpgsql as $$
declare v_id bigint; v_verdict text;
begin
  select attempt_id, verdict into v_id, v_verdict from public.otp_verify_gate(p_phone, p_ip);
  if v_verdict = 'ok' then perform public.otp_verify_record(v_id, p_ok); end if;
  return v_verdict;
end $$;

-- A live Google account holding sarah.khan@gmail.com (Google inserts need no nonce).
select lives_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea001', 'sarah.khan@gmail.com', '{}', 'google')$$,
  'a Google sign-up with no nonce is accepted');

-- ======================================================================== email_gate ordering
select is(pg_temp.gate('not-an-email', 'ip-1'), 'invalid', 'not an address → invalid');
select is(pg_temp.gate(' BV-Admin@example.com ', 'ip-1'), 'admin_address', 'an admin address → admin_address');
select is(pg_temp.gate('x@mailinator.com', 'ip-1'), 'blocked_domain', 'a disposable domain → blocked_domain');
select is(pg_temp.gate('x@a.b.mailinator.com', 'ip-1'), 'blocked_domain', 'a subdomain of a disposable domain → blocked_domain');
select is(pg_temp.gate('sarahkhan@gmail.com', 'ip-2'), 'address_taken',
  'a different form of a live account''s address → address_taken');
select is(pg_temp.gate('Sarah.Khan@gmail.com', 'ip-2'), 'ok', 'the account''s own address (any case) → ok');
select is((select outcome from public.email_requests where email_norm = 'sarahkhan@gmail.com' order by id limit 1),
  'address_taken', 'the first hit is recorded as the row''s outcome');
select is((select outcome from public.email_requests where email_norm = 'sarahkhan@gmail.com' order by id desc limit 1),
  'pending', 'an ok request is recorded as pending');
select is((select count(*)::int from public.email_requests where outcome = 'invalid'), 1, 'invalid requests are recorded');

-- per address (any +tag variant is the same address)
select is(pg_temp.gate('jo@example.org', 'ip-3'), 'ok', 'address: first ok');
select is(pg_temp.gate('jo+a@example.org', 'ip-3'), 'ok', 'address: second ok (+tag)');
select is(pg_temp.gate('JO+b@Example.org', 'ip-3'), 'ok', 'address: third ok (+tag, case)');
select is(pg_temp.gate('jo@example.org', 'ip-4'), 'address_limited', 'the fourth code for one address in 15 minutes → address_limited');
select is((select outcome from public.email_requests order by id desc limit 1), 'limited_address', 'recorded as limited_address');
update public.email_requests set created_at = now() - interval '16 minutes' where email_norm = 'jo@example.org';
select is(pg_temp.gate('jo@example.org', 'ip-4'), 'ok', 'after 15 minutes the address may ask again');
select is(pg_temp.gate('jo@example.org', 'ip-4'), 'ok', 'and again (six requests in 24 hours, the refused one included)');
update public.email_requests set created_at = now() - interval '16 minutes' where email_norm = 'jo@example.org';
select is(pg_temp.gate('jo@example.org', 'ip-4'), 'address_limited', 'six requests in 24 hours → address_limited');

-- per IP
select is((select string_agg(pg_temp.gate('ip' || g || '@example.org', 'ip-5'), ',') from generate_series(1, 10) g),
  'ok,ok,ok,ok,ok,ok,ok,ok,ok,ok', 'ten addresses from one connection are each ok');
select is(pg_temp.gate('ip11@example.org', 'ip-5'), 'ip_limited', 'the eleventh from one connection in an hour → ip_limited');
select is((select outcome from public.email_requests order by id desc limit 1), 'limited_ip', 'recorded as limited_ip');

-- Resend free-tier caps (London day and month)
insert into public.email_requests (email_norm, ip_hash, outcome)
select 'cap' || g || '@example.org', 'ip-cap', 'sent' from generate_series(1, 90) g;
select is(pg_temp.gate('fresh1@example.org', 'ip-6'), 'cap_reached', '90 sent today → cap_reached');
select is((select outcome from public.email_requests order by id desc limit 1), 'cap_reached', 'recorded as cap_reached');
delete from public.email_requests where ip_hash = 'ip-cap';
insert into public.email_requests (email_norm, ip_hash, outcome)
select 'cap' || g || '@example.org', 'ip-cap', 'sent' from generate_series(1, 89) g;
-- 2,000 earlier this month (or, on the 1st, last month: the assertion then holds trivially)
insert into public.email_requests (email_norm, ip_hash, outcome, created_at)
select 'old' || g || '@example.org', 'ip-cap', 'sent',
       date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London' + interval '1 minute'
       - case when date_trunc('day', now() at time zone 'Europe/London') = date_trunc('month', now() at time zone 'Europe/London')
              then interval '2 days' else interval '0 days' end
from generate_series(1, 2000) g;
select is(pg_temp.gate('fresh2@example.org', 'ip-6'), 'ok', '89 today plus 2,000 earlier this month → ok');
update public.settings set value = value || '{"daily_cap":1000000}'::jsonb where key = 'email_limits';
insert into public.email_requests (email_norm, ip_hash, outcome)
select 'more' || g || '@example.org', 'ip-cap', 'sent'
from generate_series(1, 2900 - (select count(*)::int from public.email_requests where outcome = 'sent'
  and created_at >= date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London')) g;
select is(pg_temp.gate('fresh3@example.org', 'ip-6'), 'cap_reached', '2,900 sent this London month → cap_reached');
delete from public.email_requests where ip_hash = 'ip-cap';
update public.settings set value = '{"address_15m":3,"address_24h":6,"ip_1h":10,"ip_24h":20,"daily_cap":90,"monthly_cap":2900}'::jsonb
where key = 'email_limits';

-- old rows go
insert into public.email_requests (email_norm, ip_hash, outcome, created_at)
values ('ancient@example.org', 'ip-old', 'sent', now() - interval '31 days');
select pg_temp.gate('fresh4@example.org', 'ip-7') is not null; -- (output 't', not a TAP 'ok')
select is((select count(*)::int from public.email_requests where email_norm = 'ancient@example.org'), 0,
  'rows older than 30 days are deleted');

select is((select value from public.settings where key = 'email_limits'),
  '{"address_15m":3,"address_24h":6,"ip_1h":10,"ip_24h":20,"daily_cap":90,"monthly_cap":2900}'::jsonb,
  'the email_limits setting');

-- ======================================================================== email_approve / email_record
select throws_ok($$select public.email_approve((select max(id) from public.email_requests where email_norm = 'fresh4@example.org'), 'not-a-hash')$$,
  null, 'bad nonce hash', 'email_approve needs a sha256 hex nonce hash');
select lives_ok($$select public.email_approve((select max(id) from public.email_requests where email_norm = 'fresh4@example.org'), repeat('a', 64))$$,
  'email_approve approves a pending request');
select is((select outcome || ':' || nonce_hash from public.email_requests where email_norm = 'fresh4@example.org'),
  'approved:' || repeat('a', 64), 'the request is approved and bound to the nonce hash');
select throws_ok($$select public.email_approve((select max(id) from public.email_requests where email_norm = 'fresh4@example.org'), repeat('b', 64))$$,
  null, 'request not pending', 'only a pending request can be approved');
select throws_ok($$select public.email_record((select max(id) from public.email_requests where email_norm = 'fresh4@example.org'), 'approved')$$,
  null, 'approve with email_approve', 'email_record cannot approve');
select lives_ok($$select public.email_record((select max(id) from public.email_requests where email_norm = 'fresh4@example.org'), 'sent')$$,
  'email_record records the send');
select is((select outcome from public.email_requests where email_norm = 'fresh4@example.org'), 'sent', 'recorded as sent');

-- ======================================================================== auth.users guard: email
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea002', 'new.person@example.org', '{}', 'email', null)$$,
  null, 'email sign-up not approved', 'an email sign-up without the app''s nonce is refused');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea002', 'pw@example.org', '{}')$$,
  null, 'email sign-up not approved', 'a password sign-up (no nonce) is refused');
select pg_temp.approved('new.person@example.org', 'nonce-e1');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea002', 'new.person@example.org', '{"bv_nonce":"guessed"}')$$,
  null, 'email sign-up not approved', 'a wrong nonce is refused');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea002', 'other@example.org', '{"bv_nonce":"nonce-e1"}')$$,
  null, 'email sign-up not approved', 'a nonce minted for one address cannot create another');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea002', 'new.person@example.org', '{"bv_nonce":"nonce-e1"}', 'email', 'x', now())$$,
  null, 'email sign-up must be confirmed by code', 'an already-confirmed email sign-up is refused even with the nonce');
select is((select consumed_at from public.email_requests where nonce_hash = pg_temp.h('nonce-e1')), null,
  'refused attempts do not use up the nonce');
select lives_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea002', 'new.person@example.org', '{"bv_nonce":"nonce-e1","x":1}')$$,
  'the sign-up carrying the app''s nonce is accepted');
select isnt((select consumed_at from public.email_requests where nonce_hash = pg_temp.h('nonce-e1')), null, 'the nonce is consumed');
select is((select raw_user_meta_data from auth.users where id = '00000000-0000-0000-0000-0000000ea002'), '{"x":1}'::jsonb,
  'the nonce is stripped from the user metadata');
select matches((select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000ea002'), '^\$2[aby]\$',
  'the password is a random bcrypt hash');
select is(pg_temp.password_works('00000000-0000-0000-0000-0000000ea002', 'attacker-pass-123'), false,
  'a password supplied with an email sign-up never works');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea003', 'new.person+2@example.org', '{"bv_nonce":"nonce-e1"}')$$,
  null, 'email sign-up not approved', 'a used nonce is refused');
select pg_temp.approved('late@example.org', 'nonce-e2', '16 minutes');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea003', 'late@example.org', '{"bv_nonce":"nonce-e2"}')$$,
  null, 'email sign-up not approved', 'a 16-minute-old approval is refused');
select pg_temp.approved('x@mailinator.com', 'nonce-e3');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea003', 'x@mailinator.com', '{"bv_nonce":"nonce-e3"}')$$,
  null, 'email domain not allowed', 'a disposable domain is refused even with a valid nonce');
select pg_temp.approved('sarahkhan+z@gmail.com', 'nonce-e4');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea003', 'sarahkhan+z@gmail.com', '{"bv_nonce":"nonce-e4"}')$$,
  null, 'email already registered', 'an address another live account holds in another form is refused');

-- Google
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea004', 'SarahKhan@googlemail.com', '{}', 'google')$$,
  null, 'email already registered', 'a Google sign-up whose normalised email a live account holds is refused');
select is(pg_temp.password_works('00000000-0000-0000-0000-0000000ea001', 'attacker-pass-123'), false,
  'a Google account never holds a usable password');
select lives_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ea005', 'g.user@example.org', '{}', 'google')$$,
  'another Google sign-up is accepted');

-- admin allow-list unchanged
select lives_ok($$insert into auth.users (id, email, encrypted_password)
  values ('00000000-0000-0000-0000-0000000ea006', 'bv-admin@example.com', extensions.crypt('admin-pass-123', extensions.gen_salt('bf')))$$,
  'an allow-listed admin email is accepted');
select is(pg_temp.password_works('00000000-0000-0000-0000-0000000ea006', 'admin-pass-123'), true, 'the admin keeps their password');

-- ======================================================================== scrub
update auth.users set encrypted_password = 'x' where id = '00000000-0000-0000-0000-0000000ea002';
select matches((select encrypted_password from auth.users where id = '00000000-0000-0000-0000-0000000ea002'), '^\$2[aby]\$',
  'a password set on an email-code account is replaced with a fresh bcrypt hash');
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000ea002';
update auth.users set encrypted_password = extensions.crypt('later-pass-123', extensions.gen_salt('bf'))
where id = '00000000-0000-0000-0000-0000000ea002';
select is(pg_temp.password_works('00000000-0000-0000-0000-0000000ea002', 'later-pass-123'), false,
  'a password set on a confirmed email-code account is scrubbed');
update auth.users set encrypted_password = extensions.crypt('admin-pass-456', extensions.gen_salt('bf'))
where id = '00000000-0000-0000-0000-0000000ea006';
select is(pg_temp.password_works('00000000-0000-0000-0000-0000000ea006', 'admin-pass-456'), true, 'the admin can change their password');
select throws_ok($$update auth.users set email_change = 'new@example.com' where id = '00000000-0000-0000-0000-0000000ea002'$$,
  null, 'email changes are not supported', 'an email-code account cannot change its address');
select throws_ok($$update auth.users set email_change = 'new@example.com' where id = '00000000-0000-0000-0000-0000000ea001'$$,
  null, 'email changes are not supported', 'a Google account cannot change its address');
select lives_ok($$update auth.users set email_change = 'bv-admin2@example.com' where id = '00000000-0000-0000-0000-0000000ea006'$$,
  'the admin can');
update auth.users set raw_user_meta_data = '{"bv_nonce":"x","k":2}' where id = '00000000-0000-0000-0000-0000000ea002';
select is((select raw_user_meta_data from auth.users where id = '00000000-0000-0000-0000-0000000ea002'), '{"k":2}'::jsonb,
  'a nonce written back by a later update is stripped');

-- ======================================================================== sign_in_kind
insert into auth.identities (user_id, provider, provider_id, identity_data)
values ('00000000-0000-0000-0000-0000000ea001', 'google', 'sub-ea001', '{"sub":"sub-ea001","email":"sarah.khan@gmail.com"}');
select is(private.sign_in_kind('00000000-0000-0000-0000-0000000ea006'), 'admin', 'an allow-listed email → admin');
select is(private.sign_in_kind('00000000-0000-0000-0000-0000000ea001'), 'google', 'a google identity → google');
select is(private.sign_in_kind('00000000-0000-0000-0000-0000000ea002'), 'email', 'a confirmed email-code account → email');
select pg_temp.approved('unconfirmed@example.org', 'nonce-e5');
select pg_temp.signup('00000000-0000-0000-0000-0000000ea007', 'unconfirmed@example.org', '{"bv_nonce":"nonce-e5"}');
select is(private.sign_in_kind('00000000-0000-0000-0000-0000000ea007'), null, 'an unconfirmed email account → null');
-- a phone account through the phone guard
select public.otp_approve((select request_id from public.otp_gate('+447700900431', 'pgtap-kind')), 'mobile', pg_temp.h('nonce-p1'));
insert into auth.users (id, phone, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000ea008', '447700900431', '{"bv_nonce":"nonce-p1"}');
update auth.users set phone_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000ea008';
select is(private.sign_in_kind('00000000-0000-0000-0000-0000000ea008'), 'phone', 'a confirmed phone account → phone');
insert into auth.identities (user_id, provider, provider_id, identity_data)
values ('00000000-0000-0000-0000-0000000ea002', 'google', 'sub-ea002', '{"sub":"sub-ea002","email":"new.person@example.org"}');
select is(private.sign_in_kind('00000000-0000-0000-0000-0000000ea002'), 'google', 'an email account that later gains a google identity → google');
select is(private.sign_in_kind('00000000-0000-0000-0000-0000000eafff'), null, 'no such user → null');

-- ======================================================================== email_verify_gate
select is((select string_agg(pg_temp.verify(v, 'vip-1', false), ',')
           from unnest(array['locked.person@gmail.com', 'lockedperson@gmail.com', 'Locked.Person+a@gmail.com',
                             'lockedperson+b@googlemail.com', 'LOCKEDPERSON@gmail.com']) v),
  'ok,ok,ok,ok,ok', 'five wrong codes for one address (any form) are each checked');
select is(pg_temp.verify('locked.person+c@gmail.com', 'vip-2', true), 'address_locked', 'the sixth is refused → address_locked');
select is((select string_agg(pg_temp.verify_phone('+447700900461', 'vip-3', false), ',') from generate_series(1, 5)),
  'ok,ok,ok,ok,ok', 'five wrong codes for a phone');
select is(pg_temp.verify_phone('+447700900461', 'vip-3', false), 'number_locked', 'otp_verify_gate still answers number_locked');
select is((select string_agg(pg_temp.verify_phone('+44770090047' || g, 'vip-4', false), ',') from generate_series(0, 9) g)
       || ',' || (select string_agg(pg_temp.verify('wrong' || g || '@example.org', 'vip-4', false), ',') from generate_series(0, 9) g),
  'ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,ok', 'twenty wrong codes from one connection across phone and email');
select is(pg_temp.verify('fresh@example.org', 'vip-4', true), 'ip_locked', 'then an email check from it → ip_locked');
select is(pg_temp.verify_phone('+447700900481', 'vip-4', true), 'ip_locked', 'and a phone check from it → ip_locked');

-- ======================================================================== my_account
insert into public.profiles (user_id, role, display_name, postcode_district)
values ('00000000-0000-0000-0000-0000000ea001', 'resident', 'Sarah K.', 'BL3');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000ea001","role":"authenticated"}';
select is(public.my_account() ->> 'sign_in_kind', 'google', 'my_account says how the person signs in');
select is(public.my_account() ->> 'email', 'sarah.khan@gmail.com', 'my_account includes the email address');
select is(public.my_account() ->> 'display_name', 'Sarah K.', 'my_account keeps its shape');
reset role;

-- ======================================================================== privileges
set local role anon;
select throws_ok($$select public.email_gate('a@example.org', 'x')$$, '42501', null, 'anon cannot execute email_gate');
select throws_ok($$select public.email_approve(1, repeat('a', 64))$$, '42501', null, 'anon cannot execute email_approve');
select throws_ok($$select public.email_record(1, 'sent')$$, '42501', null, 'anon cannot execute email_record');
select throws_ok($$select public.email_verify_gate('a@example.org', 'x')$$, '42501', null, 'anon cannot execute email_verify_gate');
reset role;
set local role authenticated;
select throws_ok($$select public.email_gate('a@example.org', 'x')$$, '42501', null, 'authenticated cannot execute email_gate');
select throws_ok($$select public.email_approve(1, repeat('a', 64))$$, '42501', null, 'authenticated cannot execute email_approve');
select throws_ok($$select public.email_record(1, 'sent')$$, '42501', null, 'authenticated cannot execute email_record');
select throws_ok($$select public.email_verify_gate('a@example.org', 'x')$$, '42501', null, 'authenticated cannot execute email_verify_gate');
select throws_ok($$select count(*) from public.email_requests$$, '42501', null, 'authenticated cannot read email_requests');
reset role;

select * from finish();
rollback;
