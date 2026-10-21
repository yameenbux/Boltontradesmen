-- Plan 2b final review I1: sign-in records are kept for at most 30 days, and an email account that asked for a code
-- but was never used is deleted after 24 hours (unless it has a profile or reviews). public.tidy_sign_in_records()
-- is for the admin or the service role; email_gate runs the same tidy at most once an hour.
-- GoTrue's inserts are simulated here as postgres.
begin;
select plan(26);

update public.settings set value = '["ret-admin@example.com"]'::jsonb where key = 'admin_emails';

create function public.ret_as(p_uid uuid, p_role text default 'authenticated') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role, 'aal', 'aal2')::text, true);
$$;
grant execute on function public.ret_as(uuid, text) to authenticated, service_role, anon;

create function pg_temp.h(p text) returns text language sql as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
-- An email-code sign-up as the app makes it (approved request + nonce), created p_age ago and never confirmed.
create function pg_temp.email_signup(p_id uuid, p_email text, p_age interval) returns void language plpgsql as $$
begin
  insert into public.email_requests (email_norm, ip_hash, outcome, nonce_hash)
  values (private.normalise_email(p_email), 'pgtap-ret', 'approved', pg_temp.h('n-' || p_id::text));
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (p_id, p_email, jsonb_build_object('bv_nonce', 'n-' || p_id::text), '{"provider":"email","providers":["email"]}');
  insert into auth.identities (provider_id, user_id, identity_data, provider)
  values (p_id::text, p_id, jsonb_build_object('sub', p_id::text, 'email', p_email), 'email');
  update auth.users set created_at = now() - p_age where id = p_id;
end $$;
create function pg_temp.live(p_id uuid) returns boolean language sql as $$
  select exists (select 1 from auth.users where id = p_id)
$$;
create function pg_temp.fixtures() returns void language plpgsql as $$
begin
  delete from public.email_requests where ip_hash like 'ret-%';
  delete from public.otp_requests where ip_hash like 'ret-%';
  delete from public.otp_verify_attempts where ip_hash like 'ret-%';
  insert into public.email_requests (email_norm, ip_hash, outcome, created_at) values
    ('old@example.org', 'ret-old', 'sent', now() - interval '31 days'),
    ('new@example.org', 'ret-new', 'sent', now() - interval '29 days');
  insert into public.otp_requests (phone_e164, ip_hash, outcome, created_at) values
    ('+447700900801', 'ret-old', 'sent', now() - interval '31 days'),
    ('+447700900802', 'ret-new', 'sent', now() - interval '29 days');
  insert into public.otp_verify_attempts (phone_e164, ip_hash, outcome, created_at) values
    ('email:old@example.org', 'ret-old', 'wrong', now() - interval '31 days');
end $$;

-- Admin, and a signed-in resident.
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-00000000ee01', 'ret-admin@example.com', now());
insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-00000000ee01', 'admin');
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data)
values ('00000000-0000-0000-0000-00000000ee02', 'ret-google@example.org', now() - interval '5 days', '{"provider":"google"}');
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('sub-ret', '00000000-0000-0000-0000-00000000ee02', '{"sub":"sub-ret"}', 'google');
insert into public.profiles (user_id, role, display_name) values ('00000000-0000-0000-0000-00000000ee02', 'resident', 'Rita R.');

-- Email accounts: abandoned for 2 days (goes), abandoned for 2 hours (stays), confirmed (stays),
-- unconfirmed with a profile (stays).
select pg_temp.email_signup('00000000-0000-0000-0000-00000000ee11', 'gone@example.org', '2 days');
select pg_temp.email_signup('00000000-0000-0000-0000-00000000ee12', 'recent@example.org', '2 hours');
select pg_temp.email_signup('00000000-0000-0000-0000-00000000ee13', 'used@example.org', '40 days');
update auth.users set email_confirmed_at = now() - interval '39 days', last_sign_in_at = now() - interval '39 days'
where id = '00000000-0000-0000-0000-00000000ee13';
select pg_temp.email_signup('00000000-0000-0000-0000-00000000ee14', 'profiled@example.org', '3 days');
insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-00000000ee14', 'resident');
select pg_temp.fixtures();

-- ---------------------------------------------------------------- who may run it
set local role anon;
select throws_ok($$select public.tidy_sign_in_records()$$, '42501', null, 'anon cannot tidy');
reset role;
set local role authenticated;
select public.ret_as('00000000-0000-0000-0000-00000000ee02');
select throws_ok($$select public.tidy_sign_in_records()$$, '42501', 'not admin', 'a resident cannot tidy');
reset role;
select ok(pg_temp.live('00000000-0000-0000-0000-00000000ee11'), 'nothing was deleted by the refused calls');

-- ---------------------------------------------------------------- the admin tidies
set local role authenticated;
select public.ret_as('00000000-0000-0000-0000-00000000ee01');
create temp table res as select public.tidy_sign_in_records() as j;
reset role;
select ok((select (j ->> 'email_requests')::int >= 1 and (j ->> 'phone_requests')::int >= 1
           and (j ->> 'code_attempts')::int >= 1 and (j ->> 'unused_accounts')::int >= 1 from res),
  'the admin can tidy, and gets counts back');
select is((select count(*)::int from public.email_requests where ip_hash = 'ret-old'), 0, 'email requests over 30 days old go');
select is((select count(*)::int from public.email_requests where ip_hash = 'ret-new'), 1, 'email requests under 30 days old stay');
select is((select count(*)::int from public.otp_requests where ip_hash = 'ret-old'), 0, 'phone requests over 30 days old go');
select is((select count(*)::int from public.otp_requests where ip_hash = 'ret-new'), 1, 'phone requests under 30 days old stay');
select is((select count(*)::int from public.otp_verify_attempts where ip_hash = 'ret-old'), 0, 'code checks over 30 days old go');
select ok(not pg_temp.live('00000000-0000-0000-0000-00000000ee11'), 'an email account unused for over 24 hours is deleted');
select ok(not exists (select 1 from auth.identities where user_id = '00000000-0000-0000-0000-00000000ee11'),
  '… with its identity');
select ok(pg_temp.live('00000000-0000-0000-0000-00000000ee12'), 'one unused for under 24 hours stays');
select ok(pg_temp.live('00000000-0000-0000-0000-00000000ee13'), 'a confirmed account stays, however old');
select ok(pg_temp.live('00000000-0000-0000-0000-00000000ee14'), 'an unconfirmed account with a profile stays');
select ok(pg_temp.live('00000000-0000-0000-0000-00000000ee01'), 'the admin stays');
select ok(pg_temp.live('00000000-0000-0000-0000-00000000ee02'), 'a Google account stays');
select ok((select last_run > now() - interval '1 minute' from private.housekeeping where job = 'tidy_sign_in_records'),
  'the run is recorded');

-- ---------------------------------------------------------------- the service role tidies
select pg_temp.fixtures();
set local role service_role;
select public.ret_as(null, 'service_role');
select lives_ok($$select public.tidy_sign_in_records()$$, 'the service role can tidy');
reset role;
select is((select count(*)::int from public.email_requests where ip_hash = 'ret-old'), 0, '… and old rows go');

-- ---------------------------------------------------------------- email_gate tidies at most once an hour
select pg_temp.fixtures();
select pg_temp.email_signup('00000000-0000-0000-0000-00000000ee15', 'gone2@example.org', '2 days');
update private.housekeeping set last_run = now() - interval '61 minutes' where job = 'tidy_sign_in_records';
select is((select verdict from public.email_gate('someone@example.org', 'ret-gate')), 'ok', 'email_gate still answers');
select is((select count(*)::int from public.otp_requests where ip_hash = 'ret-old'), 0,
  'an hour after the last tidy, an email-code request tidies');
select ok(not pg_temp.live('00000000-0000-0000-0000-00000000ee15'), '… including unused accounts');

select pg_temp.fixtures();
select pg_temp.email_signup('00000000-0000-0000-0000-00000000ee16', 'gone3@example.org', '2 days');
select is((select verdict from public.email_gate('someone2@example.org', 'ret-gate')), 'ok', 'a second request');
select is((select count(*)::int from public.otp_requests where ip_hash = 'ret-old'), 1,
  'within the hour, it does not tidy again');
select ok(pg_temp.live('00000000-0000-0000-0000-00000000ee16'), '… and leaves accounts alone');
select is((select count(*)::int from public.email_requests where ip_hash = 'ret-old'), 0,
  'email_gate still purges its own rows over 30 days old on every call');

select * from finish();
rollback;
