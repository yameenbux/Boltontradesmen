-- Trader sign-up (migration 000037): a request tied to the account that sent it, with Free or Pro; one open request
-- per account; the trader sees their own; the admin approves it onto an agreed listing, which links the account.
begin;
select plan(17);

update public.settings set value = '["ts-admin@example.com"]'::jsonb where key = 'admin_emails';
create function public.ts_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function public.ts_as(uuid) to authenticated;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000097a0', 'ts-admin@example.com');
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000009701', 'tom@ts.example', now(), '{"provider":"google"}'),
  ('00000000-0000-0000-0000-000000009702', 'other@ts.example', now(), '{"provider":"google"}');
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-0000000097a0', 'admin', null),
  ('00000000-0000-0000-0000-000000009701', 'resident', 'Tom T.'),
  ('00000000-0000-0000-0000-000000009702', 'resident', 'Ola O.');
insert into public.providers (id, slug, business_name, phone_e164, areas, status, consent_at, consent_evidence) values
  ('00000000-0000-0000-0000-0000000097b1', 'ts-tom', 'Tom Trades', '+447700900961', array['BL3'], 'consented', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000097b2', 'ts-invited', 'Not Yet', '+447700900962', array['BL3'], 'invited', null, null);

-- ---------------------------------------------------------------- access
select ok(not has_function_privilege('authenticated', 'public.submit_listing_request(text, text, text, text, text, text, text, text, uuid, text)', 'execute')
          and has_function_privilege('service_role', 'public.submit_listing_request(text, text, text, text, text, text, text, text, uuid, text)', 'execute'),
  'submitting: the server only');
select ok(not has_function_privilege('anon', 'public.my_listing_request()', 'execute')
          and not has_function_privilege('anon', 'public.admin_approve_listing_request(uuid, uuid)', 'execute'),
  'the trader and admin functions need a signed-in account');

-- ---------------------------------------------------------------- submitting
set local role service_role;
select is(public.submit_listing_request('Tom Trades', 'Tom Trader', 'Plumber', 'BL3', '+447700900961', 'tom@ts.example',
  null, 'ip-ts', '00000000-0000-0000-0000-000000009701', 'pro'), 'ok', 'a trader''s request, with Pro');
select is(public.submit_listing_request('Tom Again', 'Tom Trader', 'Plumber', 'BL3', '+447700900969', null,
  null, 'ip-ts2', '00000000-0000-0000-0000-000000009701', 'free'), 'already', 'one open request per account');
select is(public.submit_listing_request('Odd', 'Ola', 'Plumber', 'BL3', '+447700900968', null,
  null, 'ip-ts3', '00000000-0000-0000-0000-000000009702', 'gold'), 'invalid', 'the plan is Free or Pro');
select is(public.submit_listing_request('Public One', 'Pat', 'Roofer', 'BL1', '+447700900967', null, null, 'ip-ts4'),
  'ok', 'the public form''s call still works (no account, Free)');
reset role;
select is((select plan from public.listing_requests where business_name = 'Public One'), 'free', 'defaults to Free');
select ok((select user_id is null from public.listing_requests where business_name = 'Public One'), 'with no account');
create temp table ts_req as select business_name, id from public.listing_requests;
grant select on ts_req to authenticated;

-- ---------------------------------------------------------------- the trader's own
set local role authenticated;
select public.ts_as('00000000-0000-0000-0000-000000009701');
select is((public.my_listing_request())->>'plan', 'pro', 'the trader sees their request and plan');
select public.ts_as('00000000-0000-0000-0000-000000009702');
select ok(public.my_listing_request() is null, 'nobody else''s');

-- ---------------------------------------------------------------- approving
select throws_ok($$ select public.admin_approve_listing_request(
  (select id from ts_req where business_name = 'Tom Trades'), '00000000-0000-0000-0000-0000000097b1') $$,
  '42501', null, 'only the admin approves');
select public.ts_as('00000000-0000-0000-0000-0000000097a0');
select throws_ok($$ select public.admin_approve_listing_request(
  (select id from ts_req where business_name = 'Tom Trades'), '00000000-0000-0000-0000-0000000097b2') $$,
  'P0001', 'not_agreed', 'not onto a listing they haven''t agreed to');
select throws_ok($$ select public.admin_approve_listing_request(
  (select id from ts_req where business_name = 'Public One'), '00000000-0000-0000-0000-0000000097b1') $$,
  'P0001', 'no_account', 'a request with no account can''t be approved here');
select is((public.admin_approve_listing_request(
  (select id from ts_req where business_name = 'Tom Trades'), '00000000-0000-0000-0000-0000000097b1'))->>'email',
  'tom@ts.example', 'approved: the account''s email comes back for the notification');
reset role;
select is((select user_id from public.providers where slug = 'ts-tom'), '00000000-0000-0000-0000-000000009701'::uuid,
  'the listing is linked to the trader''s account');
select is((select role::text from public.profiles where user_id = '00000000-0000-0000-0000-000000009701'), 'provider',
  'and the account is a trader''s');
select is((select status from public.listing_requests where business_name = 'Tom Trades'), 'done', 'the request is done');

select * from finish();
rollback;
