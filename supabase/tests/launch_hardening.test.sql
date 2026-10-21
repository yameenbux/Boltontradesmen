-- Launch hardening (migration 000038): the rate limiter, the pre-launch lock's link check, two-step admin, the email
-- gate's order, a trader's records going with them, approval checks, quote expiry and the customer email cap.
begin;
select plan(28);

update public.settings set value = '["lh-admin@example.com"]'::jsonb where key = 'admin_emails';
create function public.lh_as(p_uid uuid, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
grant execute on function public.lh_as(uuid, text) to authenticated;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000098a0', 'lh-admin@example.com');
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000009801', 'tia@lh.example', now(), '{"provider":"google"}'),
  ('00000000-0000-0000-0000-000000009802', 'new@lh.example', now(), '{"provider":"google"}'),
  ('00000000-0000-0000-0000-000000009803', 'busy@lh.example', now(), '{"provider":"google"}');
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-0000000098a0', 'admin', null),
  ('00000000-0000-0000-0000-000000009801', 'provider', 'Tia T.'),
  ('00000000-0000-0000-0000-000000009802', 'resident', 'Nia N.'),
  ('00000000-0000-0000-0000-000000009803', 'provider', 'Bo B.');
insert into public.providers (id, slug, business_name, phone_e164, areas, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-0000000098b1', 'lh-tia', 'Tia Tiling', '+447700900981', array['BL3'], 'live', now(), '{}'::jsonb,
   '00000000-0000-0000-0000-000000009801'),
  ('00000000-0000-0000-0000-0000000098b2', 'lh-busy', 'Busy Bo', '+447700900982', array['BL3'], 'live', now(), '{}'::jsonb,
   '00000000-0000-0000-0000-000000009803'),
  ('00000000-0000-0000-0000-0000000098b3', 'lh-free', 'Free Listing', '+447700900983', array['BL3'], 'consented', now(), '{}'::jsonb, null);
insert into public.providers (id, slug, business_name, phone_e164, areas, status, consent_token, consent_token_expires_at) values
  ('00000000-0000-0000-0000-0000000098b4', 'lh-invited', 'Invited One', '+447700900984', array['BL3'], 'invited',
   '00000000-0000-4000-8000-0000000098c4', now() + interval '1 day');
insert into public.trader_link_tokens (provider_id, token_hash) values
  ('00000000-0000-0000-0000-0000000098b3', private.trader_link_hash('00000000-0000-4000-8000-0000000098c5'));

-- Tia's private records.
insert into public.job_requests (id, provider_id, name, phone_e164, district, body) values
  ('00000000-0000-0000-0000-0000000098d1', '00000000-0000-0000-0000-0000000098b1', 'Rita Resident', '+447700900991', 'BL3',
   'Need the bathroom tiled please');
insert into public.trader_billing (provider_id, account_name, sort_code, account_number) values
  ('00000000-0000-0000-0000-0000000098b1', 'Tia Tiling', '112233', '12345678');
insert into public.trade_docs (id, provider_id, kind, number, token, status, customer_name, customer_email, title, lines, total_pence, until)
values
  ('00000000-0000-0000-0000-0000000098e1', '00000000-0000-0000-0000-0000000098b1', 'quote', 1,
   '00000000-0000-4000-8000-0000000098e1', 'sent', 'Rita Resident', 'rita@lh.example', 'Bathroom tiling',
   '[{"desc":"Tiling","pence":50000}]', 50000, private.london_today() - 1),
  ('00000000-0000-0000-0000-0000000098e2', '00000000-0000-0000-0000-0000000098b1', 'quote', 2,
   '00000000-0000-4000-8000-0000000098e2', 'draft', 'Rita Resident', null, 'Kitchen',
   '[{"desc":"Tiling","pence":1000}]', 1000, null);

-- ---------------------------------------------------------------- 1. rate limiter
select ok(not has_function_privilege('authenticated', 'public.rate_allow(text, text, int, interval)', 'execute')
          and not has_function_privilege('anon', 'public.rate_allow(text, text, int, interval)', 'execute'),
  'the rate limiter is server only');
set local role service_role;
select is(array[public.rate_allow('t', 'k', 2, '1 hour'), public.rate_allow('t', 'k', 2, '1 hour'),
                public.rate_allow('t', 'k', 2, '1 hour'), public.rate_allow('t', 'other', 2, '1 hour')],
  array[true, true, false, true], 'two allowed, the third refused, other keys unaffected');

-- ---------------------------------------------------------------- 2. pre-launch lock: real links only
select ok(public.lock_grant_valid('review', 'lh-tia'), 'a live listing''s review form');
select ok(not public.lock_grant_valid('review', 'no-such-trader'), 'not a made-up listing');
select ok(public.lock_grant_valid('doc', '00000000-0000-4000-8000-0000000098e1'), 'a sent quote');
select ok(not public.lock_grant_valid('doc', '00000000-0000-4000-8000-0000000098e2'), 'not a draft');
select ok(not public.lock_grant_valid('doc', 'x'), 'not something that isn''t a token');
select ok(public.lock_grant_valid('consent', '00000000-0000-4000-8000-0000000098c4'), 'an unused consent link');
select ok(public.lock_grant_valid('link', '00000000-0000-4000-8000-0000000098c5'), 'an unused trader link');
select ok(not public.lock_grant_valid('link', '00000000-0000-4000-8000-0000000098c6'), 'not an unknown trader link');
reset role;
select ok(not has_function_privilege('anon', 'public.lock_grant_valid(text, text)', 'execute'), 'the link check is server only');

-- ---------------------------------------------------------------- 3. two-step admin
set local role authenticated;
select public.lh_as('00000000-0000-0000-0000-0000000098a0', 'aal1');
select ok(not public.is_admin(), 'the admin password alone isn''t admin');
select ok(public.am_i_admin_account(), 'but the admin pages know to ask for the code');
select throws_ok($$ select public.admin_list_providers() $$, '42501', null, 'no admin function at aal1');
select public.lh_as('00000000-0000-0000-0000-0000000098a0', 'aal2');
select ok(public.is_admin(), 'admin after the authenticator code');
select public.lh_as('00000000-0000-0000-0000-000000009802', 'aal2');
select ok(not public.is_admin() and not public.am_i_admin_account(), 'nobody else, whatever their level');
reset role;

-- ---------------------------------------------------------------- 4. email gate: limits before anything revealing
set local role service_role;
select is((select verdict from public.email_gate('lh-admin@example.com', 'ip-lh-1')), 'admin_address',
  'the gate still knows the admin address (the app answers it like any other)');
select public.email_gate('lh-admin@example.com', 'ip-lh-2');
select public.email_gate('lh-admin@example.com', 'ip-lh-3');
select is((select verdict from public.email_gate('lh-admin@example.com', 'ip-lh-4')), 'address_limited',
  'past the address limit, the admin address gets the same answer as any other');
reset role;

-- ---------------------------------------------------------------- 7. quote expiry and the email cap
set local role service_role;
select is(public.answer_quote('00000000-0000-4000-8000-0000000098e1', true) ->> 'result', 'expired',
  'a quote past its valid-until can''t be accepted');
select is(public.answer_quote('00000000-0000-4000-8000-0000000098e1', false) ->> 'result', 'ok', 'but it can be declined');
reset role;
insert into public.notifications (provider_id, kind, ref_id, channel, to_addr, status)
select '00000000-0000-0000-0000-0000000098b2', 'doc_email', gen_random_uuid(), 'email', 'someone@lh.example', 'sent'
from generate_series(1, 30);
insert into public.trade_docs (id, provider_id, kind, number, status, customer_name, customer_email, title, lines, total_pence)
values ('00000000-0000-0000-0000-0000000098e3', '00000000-0000-0000-0000-0000000098b2', 'quote', 1, 'sent', 'Sam',
        'sam@lh.example', 'Job', '[{"desc":"Job","pence":100}]', 100);
set local role service_role;
select is(jsonb_array_length(public.claim_customer_message('doc_email', '00000000-0000-0000-0000-0000000098e3') -> 'send'), 0,
  'the 31st email to customers in a day isn''t sent');
reset role;

-- ---------------------------------------------------------------- 5. a trader's records go with them
set local role authenticated;
select public.lh_as('00000000-0000-0000-0000-0000000098a0', 'aal2');
select public.admin_unlink_provider('00000000-0000-0000-0000-0000000098b1', 'Wrong account linked');
reset role;
select is((select count(*)::int from public.job_requests where provider_id = '00000000-0000-0000-0000-0000000098b1')
        + (select count(*)::int from public.trade_docs where provider_id = '00000000-0000-0000-0000-0000000098b1')
        + (select count(*)::int from public.trader_billing where provider_id = '00000000-0000-0000-0000-0000000098b1'), 0,
  'unlinking clears the job requests, quotes and bank details');
select ok(exists (select 1 from public.providers where id = '00000000-0000-0000-0000-0000000098b1' and status = 'live'),
  'the listing itself stays');

insert into public.trader_billing (provider_id, account_name, sort_code, account_number) values
  ('00000000-0000-0000-0000-0000000098b2', 'Busy Bo', '112233', '12345678');
set local role authenticated;
select public.lh_as('00000000-0000-0000-0000-000000009803', 'aal1');
select public.delete_my_account();
reset role;
select is((select count(*)::int from public.trader_billing where provider_id = '00000000-0000-0000-0000-0000000098b2')
        + (select count(*)::int from public.trade_docs where provider_id = '00000000-0000-0000-0000-0000000098b2')
        + (select count(*)::int from public.notifications where provider_id = '00000000-0000-0000-0000-0000000098b2'), 0,
  'a trader deleting their account takes their records with them');

-- ---------------------------------------------------------------- 6. approving a sign-up request
insert into public.listing_requests (id, business_name, contact_name, trade, area, phone_e164, user_id, plan) values
  ('00000000-0000-0000-0000-0000000098f1', 'Nia Builds', 'Nia N', 'Builder', 'BL3', '+447700900985',
   '00000000-0000-0000-0000-000000009802', 'free'),
  ('00000000-0000-0000-0000-0000000098f2', 'Admin Biz', 'Admin', 'Builder', 'BL3', '+447700900986',
   '00000000-0000-0000-0000-0000000098a0', 'free');
update public.providers set user_id = '00000000-0000-0000-0000-000000009802' where id = '00000000-0000-0000-0000-0000000098b1';
set local role authenticated;
select public.lh_as('00000000-0000-0000-0000-0000000098a0', 'aal2');
select throws_ok($$ select public.admin_approve_listing_request('00000000-0000-0000-0000-0000000098f1', '00000000-0000-0000-0000-0000000098b3') $$,
  'P0001', 'account_already_linked', 'an account already running a listing can''t be given a second');
select throws_ok($$ select public.admin_approve_listing_request('00000000-0000-0000-0000-0000000098f2', '00000000-0000-0000-0000-0000000098b3') $$,
  'P0001', 'account_not_allowed', 'the admin''s own account can''t be linked to a listing');
reset role;

-- ---------------------------------------------------------------- 8. nothing callable by anon
select is(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('anon', p.oid, 'execute')
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and p.proname not like 'lh\_%'),
  0, 'no database function can be called by a visitor who isn''t signed in');
select ok(not has_function_privilege('anon', 'public.am_i_admin_account()', 'execute')
          and not has_schema_privilege('anon', 'private', 'usage'),
  'not even the admin-account check; and the private schema''s helpers are out of reach altogether');

select * from finish();
rollback;
