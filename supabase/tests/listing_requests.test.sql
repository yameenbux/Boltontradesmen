-- Launch checklist: "Get listed" requests (migration 000026). Only the service role submits (the form's server
-- action); only the admin reads and changes them, with an audit row; limits per connection, per number and per
-- day; requests are deleted after 90 days.
begin;
select plan(53);

update public.settings set value = '["lr-admin@example.com"]'::jsonb where key = 'admin_emails';

create function public.lr_as(p_uid uuid, p_role text default 'authenticated') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
$$;
grant execute on function public.lr_as(uuid, text) to authenticated, service_role, anon;

-- submit_listing_request with sensible defaults, as the service role would call it.
create function public.lr_submit(
  p_phone text default '+447700900501', p_ip text default 'lr-ip-1', p_business text default 'Ace Plumbing',
  p_name text default 'Sam', p_trade text default 'Plumber', p_area text default 'BL3', p_email text default null,
  p_message text default null
) returns text language sql as $$
  select public.submit_listing_request(p_business, p_name, p_trade, p_area, p_phone, p_email, p_message, p_ip)
$$;
grant execute on function public.lr_submit(text, text, text, text, text, text, text, text) to service_role;

insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-00000000aa01', 'lr-admin@example.com', now());
insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-00000000aa01', 'admin');
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data)
values ('00000000-0000-0000-0000-00000000aa02', 'lr-resident@example.org', now(), '{"provider":"google"}');
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('sub-lr', '00000000-0000-0000-0000-00000000aa02', '{"sub":"sub-lr"}', 'google');
insert into public.profiles (user_id, role, display_name) values ('00000000-0000-0000-0000-00000000aa02', 'resident', 'Rita R.');

-- ---------------------------------------------------------------- table locked down
select ok((select relrowsecurity from pg_class where oid = 'public.listing_requests'::regclass), 'RLS is on');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'listing_requests'), 0,
  'no policies');
select ok(not has_table_privilege('anon', 'public.listing_requests', 'select'), 'anon cannot read the table');
select ok(not has_table_privilege('anon', 'public.listing_requests', 'insert'), 'anon cannot insert');
select ok(not has_table_privilege('authenticated', 'public.listing_requests', 'select'), 'authenticated cannot read');
select ok(not has_table_privilege('authenticated', 'public.listing_requests', 'insert'), 'authenticated cannot insert');
select ok(not has_table_privilege('service_role', 'public.listing_requests', 'select'),
  'even the service role goes through the functions');

set local role anon;
select throws_ok($$select * from public.listing_requests$$, '42501', null, 'anon select is refused');
reset role;
set local role authenticated;
select public.lr_as('00000000-0000-0000-0000-00000000aa02');
select throws_ok($$select * from public.listing_requests$$, '42501', null, 'a signed-in select is refused');
reset role;

-- ---------------------------------------------------------------- who may submit
select ok(not has_function_privilege('anon', 'public.submit_listing_request(text, text, text, text, text, text, text, text)', 'execute'),
  'anon cannot submit directly');
select ok(not has_function_privilege('authenticated', 'public.submit_listing_request(text, text, text, text, text, text, text, text)', 'execute'),
  'authenticated cannot submit directly');
select ok(has_function_privilege('service_role', 'public.submit_listing_request(text, text, text, text, text, text, text, text)', 'execute'),
  'the service role can submit');
select ok(not has_function_privilege('anon', 'public.admin_list_listing_requests(text)', 'execute'), 'anon cannot list');
select ok(not has_function_privilege('anon', 'public.admin_set_listing_request_status(uuid, text)', 'execute'),
  'anon cannot set a status');
select ok(has_function_privilege('authenticated', 'public.admin_list_listing_requests(text)', 'execute'),
  'authenticated may call the list (it checks is_admin itself)');

-- ---------------------------------------------------------------- submitting and trimming
set local role service_role;
select public.lr_as(null, 'service_role');
select is(public.lr_submit(p_business => '  Ace Plumbing  ', p_name => ' Sam ', p_email => ' Sam@Example.ORG ',
                         p_message => '  ', p_area => ''), 'ok', 'a good request is stored');
reset role;
select is((select business_name || '|' || contact_name || '|' || coalesce(area, 'null') || '|' || email || '|' ||
                  coalesce(message, 'null') || '|' || status
           from public.listing_requests where phone_e164 = '+447700900501'),
  'Ace Plumbing|Sam|null|sam@example.org|null|new', 'input is trimmed, the email lowercased, blanks stored as null');
select ok((select handled_at is null and ip_hash = 'lr-ip-1' from public.listing_requests where phone_e164 = '+447700900501'),
  'new, not handled, with the connection hash');

-- ---------------------------------------------------------------- validation
set local role service_role;
select is(public.lr_submit(p_business => '   ', p_ip => 'lr-ip-v'), 'invalid', 'a blank business name is invalid');
select is(public.lr_submit(p_business => repeat('a', 81), p_ip => 'lr-ip-v'), 'invalid', 'an 81-character business name is invalid');
select is(public.lr_submit(p_name => '', p_ip => 'lr-ip-v'), 'invalid', 'a blank name is invalid');
select is(public.lr_submit(p_name => repeat('a', 61), p_ip => 'lr-ip-v'), 'invalid', 'a 61-character name is invalid');
select is(public.lr_submit(p_trade => null, p_ip => 'lr-ip-v'), 'invalid', 'a missing trade is invalid');
select is(public.lr_submit(p_area => repeat('a', 61), p_ip => 'lr-ip-v'), 'invalid', 'a 61-character area is invalid');
select is(public.lr_submit(p_phone => '07700900501', p_ip => 'lr-ip-v'), 'invalid', 'a number not in E.164 is invalid');
select is(public.lr_submit(p_phone => '+15555550100', p_ip => 'lr-ip-v'), 'invalid', 'a foreign number is invalid');
select is(public.lr_submit(p_email => 'not-an-email', p_ip => 'lr-ip-v'), 'invalid', 'a malformed email is invalid');
select is(public.lr_submit(p_message => repeat('a', 501), p_ip => 'lr-ip-v'), 'invalid', 'a 501-character message is invalid');
select is(public.lr_submit(p_phone => '+441204123456', p_ip => 'lr-ip-v', p_message => repeat('a', 500)), 'ok',
  'a landline and a 500-character message are fine');
reset role;
select is((select count(*)::int from public.listing_requests where ip_hash = 'lr-ip-v'), 1, 'invalid requests store nothing');

-- ---------------------------------------------------------------- limits
set local role service_role;
-- Per number: 2 in 7 days (one already stored for +447700900501).
select is(public.lr_submit(p_ip => 'lr-ip-2'), 'ok', 'a second request for the same number is fine');
select is(public.lr_submit(p_ip => 'lr-ip-3'), 'limited', 'a third for the same number within 7 days is limited');
-- Per connection: 3 in 24 hours.
select is(public.lr_submit(p_phone => '+447700900511', p_ip => 'lr-ip-4'), 'ok', 'connection: first');
select is(public.lr_submit(p_phone => '+447700900512', p_ip => 'lr-ip-4'), 'ok', 'connection: second');
select is(public.lr_submit(p_phone => '+447700900513', p_ip => 'lr-ip-4'), 'ok', 'connection: third');
select is(public.lr_submit(p_phone => '+447700900514', p_ip => 'lr-ip-4'), 'limited', 'connection: a fourth in 24 hours is limited');
reset role;
-- Older requests don't count.
update public.listing_requests set created_at = now() - interval '8 days' where phone_e164 = '+447700900501';
update public.listing_requests set created_at = now() - interval '25 hours' where ip_hash = 'lr-ip-4';
set local role service_role;
select is(public.lr_submit(p_ip => 'lr-ip-5'), 'ok', 'the number limit is over 7 days');
select is(public.lr_submit(p_phone => '+447700900515', p_ip => 'lr-ip-4'), 'ok', 'the connection limit is over 24 hours');
reset role;
-- Site-wide: 50 a day.
insert into public.listing_requests (business_name, contact_name, trade, phone_e164, ip_hash)
select 'Cap ' || g, 'Cap', 'Cap', '+4477009006' || lpad(g::text, 2, '0'), 'lr-cap-' || g
from generate_series(1, 50 - (select count(*)::int from public.listing_requests
                               where created_at >= date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London')) g;
set local role service_role;
select is(public.lr_submit(p_phone => '+447700900599', p_ip => 'lr-ip-6'), 'limited', 'the 51st request of the day is limited');
reset role;
delete from public.listing_requests where ip_hash like 'lr-cap-%';

-- ---------------------------------------------------------------- admin functions
select set_config('lr.id', (select id::text from public.listing_requests where ip_hash = 'lr-ip-2'), true);
set local role anon;
select throws_ok($$select public.admin_list_listing_requests(null)$$, '42501', null, 'anon cannot list requests');
reset role;
set local role authenticated;
select public.lr_as('00000000-0000-0000-0000-00000000aa02');
select throws_ok($$select public.admin_list_listing_requests('new')$$, '42501', 'not admin', 'a resident cannot list requests');
select throws_ok(
  format($$select public.admin_set_listing_request_status(%L, 'done')$$,
         current_setting('lr.id')),
  '42501', 'not admin', 'a resident cannot change a request');
reset role;

set local role authenticated;
select public.lr_as('00000000-0000-0000-0000-00000000aa01');
select ok(jsonb_array_length(public.admin_list_listing_requests('new')) >= 5
          and (public.admin_list_listing_requests('new') -> 0 ->> 'phone_e164') is not null,
  'the admin lists new requests, with the phone number');
select is((public.admin_counts() ->> 'listing_requests')::int, jsonb_array_length(public.admin_list_listing_requests('new')),
  'admin_counts counts new requests');
select lives_ok(
  format($$select public.admin_set_listing_request_status(%L, 'done')$$,
         current_setting('lr.id')),
  'the admin marks a request done');
select throws_ok($$select public.admin_set_listing_request_status(gen_random_uuid(), 'spam')$$, 'P0002', null,
  'an unknown request is refused');
reset role;
select is((select status || '|' || (handled_at is not null)::text from public.listing_requests where ip_hash = 'lr-ip-2'),
  'done|true', 'status and handled time are set');
select ok(exists (select 1 from public.audit_log where action = 'set_listing_request_status' and target_type = 'listing_request'
                  and target_id = (select id::text from public.listing_requests where ip_hash = 'lr-ip-2')
                  and actor_id = '00000000-0000-0000-0000-00000000aa01' and reason = 'done'),
  'the change is in the audit log');

-- ---------------------------------------------------------------- retention: 90 days
update public.listing_requests set created_at = now() - interval '91 days' where ip_hash = 'lr-ip-2';
update public.listing_requests set created_at = now() - interval '89 days' where ip_hash = 'lr-ip-5';
set local role service_role;
select public.lr_as(null, 'service_role');
select ok((public.tidy_sign_in_records() ->> 'listing_requests')::int >= 1, 'the sign-in tidy also deletes old requests');
reset role;
select is((select count(*)::int from public.listing_requests where ip_hash = 'lr-ip-2'), 0, 'a request over 90 days old is gone');
select is((select count(*)::int from public.listing_requests where ip_hash = 'lr-ip-5'), 1, 'one under 90 days old stays');
update public.listing_requests set created_at = now() - interval '91 days' where ip_hash = 'lr-ip-v';
set local role service_role;
select is(public.lr_submit(p_phone => '+447700900521', p_ip => 'lr-ip-7'), 'ok', 'another request');
reset role;
select is((select count(*)::int from public.listing_requests where ip_hash = 'lr-ip-v'), 0,
  '… and every submission also deletes requests over 90 days old');

select * from finish();
rollback;
