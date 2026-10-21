-- Pro, part 2 (migration 000035): founding Pro granted by the admin; where a trader's alerts go; the alert log's
-- once-only rows and daily caps; job requests (Pro traders only, limited, private to the trader); and Ask Bolton
-- alerts for Pro traders in the trade who cover the area.
begin;
select plan(39);

update public.settings set value = '["pj-admin@example.com"]'::jsonb where key = 'admin_emails';

create function public.pj_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
grant execute on function public.pj_as(uuid) to authenticated;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000095a0', 'pj-admin@example.com');
-- Google accounts (an email-code account needs the sign-up gate first).
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000009501', 'pat@pj.example', now(), '{"provider":"google"}'),
  ('00000000-0000-0000-0000-000000009502', 'kim@pj.example', now(), '{"provider":"google"}'),
  ('00000000-0000-0000-0000-000000009503', 'asker@pj.example', now(), '{"provider":"google"}');
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-0000000095a0', 'admin', null),
  ('00000000-0000-0000-0000-000000009501', 'provider', 'Pat P.'),
  ('00000000-0000-0000-0000-000000009502', 'provider', 'Kim K.'),
  ('00000000-0000-0000-0000-000000009503', 'resident', 'Ash A.');
-- Pat: pj-pro (founding Pro, plumber, BL3). Kim: pj-free (plumber, BL3, never Pro). pj-far: Pro, plumber, BL7 only.
insert into public.providers (id, slug, business_name, phone_e164, areas, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-0000000095b1', 'pj-pro', 'PJ Pro', '+447700900971', array['BL3'], 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000009501'),
  ('00000000-0000-0000-0000-0000000095b2', 'pj-free', 'PJ Free', '+447700900972', array['BL3'], 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000009502'),
  ('00000000-0000-0000-0000-0000000095b3', 'pj-far', 'PJ Far', '+441204555000', array['BL7'], 'live', now(), '{}'::jsonb, null);
insert into public.provider_categories (provider_id, category_id)
select p.id, c.id from public.providers p cross join public.categories c
where p.slug in ('pj-pro', 'pj-free', 'pj-far') and c.slug = 'plumber';

-- ---------------------------------------------------------------- access
select ok(not has_table_privilege('authenticated', 'public.pro_grants', 'select')
          and not has_table_privilege('service_role', 'public.job_requests', 'select')
          and not has_table_privilege('anon', 'public.notifications', 'select')
          and not has_table_privilege('authenticated', 'public.trader_alert_settings', 'select'),
  'no table access to the new tables (functions only)');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.pro_grants'::regclass,
  'public.job_requests'::regclass, 'public.notifications'::regclass, 'public.trader_alert_settings'::regclass)),
  'row level security is on for all four');
select ok(not has_function_privilege('anon', 'public.submit_job_request(text, text, text, text, text, text, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.submit_job_request(text, text, text, text, text, text, text)', 'execute')
          and has_function_privilege('service_role', 'public.submit_job_request(text, text, text, text, text, text, text)', 'execute'),
  'submit_job_request: the server only');
select ok(not has_function_privilege('authenticated', 'public.claim_question_alerts(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.claim_job_request_alerts(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.mark_notification(uuid, boolean, text)', 'execute'),
  'the alert sender functions: the server only');
select ok(not has_function_privilege('anon', 'public.admin_grant_pro(uuid, date, text)', 'execute')
          and not has_function_privilege('anon', 'public.my_job_requests(uuid)', 'execute'),
  'the trader and admin functions need a signed-in account');

-- ---------------------------------------------------------------- founding Pro
select ok(not private.is_pro('00000000-0000-0000-0000-0000000095b1'), 'not Pro before a grant');
select ok((select not takes_requests from public.provider_public where slug = 'pj-pro'), 'no requests before Pro');

set local role authenticated;
select public.pj_as('00000000-0000-0000-0000-000000009502');
select throws_ok($$ select public.admin_grant_pro('00000000-0000-0000-0000-0000000095b1', current_date + 30, null) $$,
  '42501', null, 'a trader cannot grant Pro');
select public.pj_as('00000000-0000-0000-0000-0000000095a0');
select throws_ok($$ select public.admin_grant_pro('00000000-0000-0000-0000-0000000095b1', current_date - 1, null) $$,
  'P0001', 'bad_date', 'not in the past');
select throws_ok($$ select public.admin_grant_pro('00000000-0000-0000-0000-0000000095b1', current_date + 800, null) $$,
  'P0001', 'bad_date', 'not more than two years ahead');
select is(public.admin_grant_pro('00000000-0000-0000-0000-0000000095b1', current_date + 180, 'Founding trader'), 'pj-pro',
  'the admin grants founding Pro');
select is(public.admin_grant_pro('00000000-0000-0000-0000-0000000095b3', current_date + 30, null), 'pj-far',
  'and to a second listing');
select is((public.admin_pro_grant('00000000-0000-0000-0000-0000000095b1'))->>'note', 'Founding trader', 'the admin sees it');
reset role;

select ok(private.is_pro('00000000-0000-0000-0000-0000000095b1'), 'a live grant makes the listing Pro');
select ok((select takes_requests from public.provider_public where slug = 'pj-pro'), 'and its page takes requests');
select ok(exists (select 1 from public.audit_log where action = 'pro_granted'
                  and target_id = '00000000-0000-0000-0000-0000000095b1'), 'the grant is audit-logged');
update public.pro_grants set until = private.london_today() - 1 where provider_id = '00000000-0000-0000-0000-0000000095b3';
select ok(not private.is_pro('00000000-0000-0000-0000-0000000095b3'), 'a grant ends after its last day');
update public.pro_grants set until = private.london_today() where provider_id = '00000000-0000-0000-0000-0000000095b3';
select ok(private.is_pro('00000000-0000-0000-0000-0000000095b3'), 'and lasts all of its last day');

set local role authenticated;
select public.pj_as('00000000-0000-0000-0000-000000009501');
select is((public.my_pro_status('00000000-0000-0000-0000-0000000095b1'))->'grant'->>'note', 'Founding trader',
  'the trader sees their grant');
reset role;

-- ---------------------------------------------------------------- alert settings
select is(private.alert_targets('00000000-0000-0000-0000-0000000095b1')->>'sms', '+447700900971',
  'texts default to the listing''s mobile');
select is(private.alert_targets('00000000-0000-0000-0000-0000000095b1')->>'email', 'pat@pj.example',
  'emails default to the linked account');
select ok(private.alert_targets('00000000-0000-0000-0000-0000000095b3')->>'sms' is null,
  'no texts to a landline, and no email without an account');
set local role authenticated;
select public.pj_as('00000000-0000-0000-0000-000000009502');
select throws_ok($$ select public.my_alert_settings('00000000-0000-0000-0000-0000000095b1') $$,
  'P0001', 'not_your_listing', 'a trader cannot read someone else''s settings');
select public.pj_as('00000000-0000-0000-0000-000000009501');
select throws_ok($$ select public.set_my_alert_settings('00000000-0000-0000-0000-0000000095b1', '01204555111', null, true, true, true) $$,
  'P0001', 'bad_mobile', 'alert texts need a mobile');
select lives_ok($$ select public.set_my_alert_settings('00000000-0000-0000-0000-0000000095b1', '+447700900979', ' Pat.Work@PJ.example ', true, true, true) $$,
  'the trader sets their own number and email');
select is((public.my_alert_settings('00000000-0000-0000-0000-0000000095b1'))->>'email', 'pat.work@pj.example',
  'stored trimmed and lowercased');
reset role;

-- ---------------------------------------------------------------- job requests
set local role service_role;
select is((public.submit_job_request('pj-free', 'Ash', '+447700900981', null, 'BL3', 'Leaking kitchen tap please', 'ip1'))->>'result',
  'unavailable', 'not to a listing without Pro');
create temp table pj_req as
  select public.submit_job_request('pj-pro', 'Ash', '+447700900981', 'ash@pj.example', 'bl3', 'Leaking kitchen tap please', 'ip1') as r;
select is((select r->>'result' from pj_req), 'ok', 'a Pro listing takes a request');
select is((public.submit_job_request('pj-pro', 'Ash', '+447700900981', null, 'BL3', 'Same job again sorry', 'ip2'))->>'result',
  'limited', 'one request per number per listing per day');
create temp table pj_send as select public.claim_job_request_alerts(((select r->>'id' from pj_req))::uuid) as s;
select is((select jsonb_array_length(s->'send') from pj_send), 2, 'claims a text and an email');
select is((select s->'send'->0->>'to' from pj_send), '+447700900979', 'to the trader''s chosen number');
select is((select jsonb_array_length(public.claim_job_request_alerts(((select r->>'id' from pj_req))::uuid)->'send')), 0,
  'never twice for the same request');
select lives_ok($$ select public.mark_notification(((select s->'send'->0->>'id' from pj_send))::uuid, true, null) $$,
  'the sender marks it sent');
reset role;
select is((select status from public.notifications where id = ((select s->'send'->0->>'id' from pj_send))::uuid), 'sent',
  'and it shows as sent');
grant select on pj_req to authenticated;

set local role authenticated;
select public.pj_as('00000000-0000-0000-0000-000000009502');
select throws_ok($$ select public.my_job_requests('00000000-0000-0000-0000-0000000095b1') $$,
  'P0001', 'not_your_listing', 'another trader cannot see the requests');
select public.pj_as('00000000-0000-0000-0000-000000009501');
select is(jsonb_array_length(public.my_job_requests('00000000-0000-0000-0000-0000000095b1')), 1, 'the trader sees theirs');
select lives_ok($$ select public.set_my_job_request_status(((select r->>'id' from pj_req))::uuid, 'won') $$,
  'and marks it won');
reset role;

-- ---------------------------------------------------------------- Ask Bolton alerts
insert into public.questions (id, asker_id, category_id, district, body, status, published_at)
select '00000000-0000-0000-0000-0000000095c1', '00000000-0000-0000-0000-000000009503', c.id, 'BL3',
       'Anyone know a good plumber in BL3?', 'published', now()
from public.categories c where c.slug = 'plumber';
set local role service_role;
create temp table pj_q as select public.claim_question_alerts('00000000-0000-0000-0000-0000000095c1') as s;
reset role;
select is((select array_agg(distinct (e->>'provider_id')) from pj_q, jsonb_array_elements(s->'send') e),
  array['00000000-0000-0000-0000-0000000095b1'],
  'only the Pro plumber who covers BL3 is told (not the free one, not the one in BL7)');

-- The daily text cap.
insert into public.notifications (provider_id, kind, ref_id, channel, to_addr, status)
select '00000000-0000-0000-0000-0000000095b1', 'question', gen_random_uuid(), 'sms', '+447700900979', 'sent'
from generate_series(1, 10);
insert into public.questions (id, asker_id, category_id, district, body, status, published_at)
select '00000000-0000-0000-0000-0000000095c2', '00000000-0000-0000-0000-000000009503', c.id, 'BL3',
       'Another plumbing question in BL3', 'published', now()
from public.categories c where c.slug = 'plumber';
set local role service_role;
select is((select array_agg(e->>'channel') from jsonb_array_elements(
  public.claim_question_alerts('00000000-0000-0000-0000-0000000095c2')->'send') e), array['email'],
  'after 10 texts in a day, email only');
reset role;

select * from finish();
rollback;
