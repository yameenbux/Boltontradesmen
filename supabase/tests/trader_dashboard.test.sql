-- Trader dashboard (migration 000029): enquiry counts (one per person or device per Bolton day; the trader's own and
-- the admin's taps left out), only for the linked trader or the admin; the trader's own bio and area edits; pause,
-- unpause and withdraw, each audited, with an admin's pause never undone by the trader.
begin;
select plan(87);

update public.settings set value = '["td-admin@example.com"]'::jsonb where key = 'admin_emails';

create function public.td_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function public.td_as(uuid) to authenticated;
-- A moment in Bolton: the first of this month (London) plus months and an offset, as a timestamptz.
create function public.td_at(p_months int, p_offset interval) returns timestamptz language sql stable as $$
  select (date_trunc('month', now() at time zone 'Europe/London') + make_interval(months => p_months) + p_offset)
         at time zone 'Europe/London'
$$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000093a0', 'td-admin@example.com');
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000009301'), ('00000000-0000-0000-0000-000000009302'),
  ('00000000-0000-0000-0000-000000009303'), ('00000000-0000-0000-0000-000000009304'),
  ('00000000-0000-0000-0000-000000009305');
insert into public.profiles (user_id, role, display_name, blocked_at) values
  ('00000000-0000-0000-0000-0000000093a0', 'admin', null, null),
  ('00000000-0000-0000-0000-000000009301', 'provider', 'Tara T.', null),
  ('00000000-0000-0000-0000-000000009302', 'provider', 'Olly O.', null),
  ('00000000-0000-0000-0000-000000009303', 'resident', 'Rita R.', null),
  ('00000000-0000-0000-0000-000000009304', 'provider', 'Ben B.', now()),
  ('00000000-0000-0000-0000-000000009305', 'resident', 'Sue S.', null);
-- Tara: td-live (live) and td-held (paused by the admin). Olly: td-other. Ben (blocked): td-blocked. td-free unlinked.
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id, bio, areas) values
  ('00000000-0000-0000-0000-0000000093b1', 'td-live', 'TD Live', '+447700900951', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000009301', 'Old bio', array['BL1']),
  ('00000000-0000-0000-0000-0000000093b2', 'td-other', 'TD Other', '+447700900952', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000009302', null, array['BL2']),
  ('00000000-0000-0000-0000-0000000093b3', 'td-held', 'TD Held', '+447700900953', 'paused', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000009301', null, array['BL3']),
  ('00000000-0000-0000-0000-0000000093b4', 'td-blocked', 'TD Blocked', '+447700900954', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000009304', null, array['BL4']),
  ('00000000-0000-0000-0000-0000000093b5', 'td-free', 'TD Free', '+447700900955', 'live', now(), '{}'::jsonb, null, null, array['BL5']);
insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-0000000093b1', id from public.categories where slug = 'plumber';

-- ---------------------------------------------------------------- grants
select ok(not has_function_privilege('anon', 'public.my_enquiry_stats(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.my_enquiry_stats(uuid)', 'execute'),
  'my_enquiry_stats: signed-in accounts only');
select ok(not has_function_privilege('anon', 'public.admin_enquiry_stats(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.admin_enquiry_stats(uuid)', 'execute'),
  'admin_enquiry_stats: signed-in accounts only (it checks is_admin itself)');
select ok(not has_function_privilege('anon', 'public.update_my_listing(uuid, text, text[])', 'execute')
          and not has_function_privilege('anon', 'public.pause_my_listing(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.unpause_my_listing(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.withdraw_my_listing(uuid)', 'execute'),
  'the listing writes need a signed-in account');
select ok(not has_function_privilege('authenticated', 'private.enquiries(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'private.enquiry_stats(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'private.my_listing(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'private.trader_set_status(uuid, public.provider_status, text)', 'execute'),
  'the private helpers are not callable directly');
select ok(not has_function_privilege('authenticated', 'public.enquiry_count(uuid)', 'execute'),
  'enquiry_count stays service role only');

-- ---------------------------------------------------------------- enquiries
-- This month on td-live: dev-a calls 3 times then WhatsApps (one enquiry, a call), dev-b WhatsApps (one), Rita (signed
-- in) calls from two devices (one), Tara taps her own listing and the admin taps it (neither counts), one profile view.
insert into public.contact_events (provider_id, type, actor_id, device_hash, created_at)
select '00000000-0000-0000-0000-0000000093b1', 'call_tap'::public.contact_type, null::uuid, 'dev-a', now() - interval '2 seconds'
from generate_series(1, 3);
insert into public.contact_events (provider_id, type, actor_id, device_hash, created_at) values
  ('00000000-0000-0000-0000-0000000093b1', 'whatsapp_tap', null, 'dev-a', now()),
  ('00000000-0000-0000-0000-0000000093b1', 'whatsapp_tap', null, 'dev-b', now()),
  ('00000000-0000-0000-0000-0000000093b1', 'call_tap', '00000000-0000-0000-0000-000000009303', 'dev-r1', now() - interval '1 second'),
  ('00000000-0000-0000-0000-0000000093b1', 'whatsapp_tap', '00000000-0000-0000-0000-000000009303', 'dev-r2', now()),
  ('00000000-0000-0000-0000-0000000093b1', 'call_tap', '00000000-0000-0000-0000-000000009301', 'dev-own', now()),
  ('00000000-0000-0000-0000-0000000093b1', 'whatsapp_tap', '00000000-0000-0000-0000-0000000093a0', 'dev-adm', now()),
  ('00000000-0000-0000-0000-0000000093b1', 'profile_view', null, 'dev-v', now()),
  -- Last month, the 3rd: dev-c calls twice (one). Three months ago: dev-d WhatsApps. Seven months ago: dev-e calls.
  ('00000000-0000-0000-0000-0000000093b1', 'call_tap', null, 'dev-c', public.td_at(-1, interval '2 days 9 hours')),
  ('00000000-0000-0000-0000-0000000093b1', 'call_tap', null, 'dev-c', public.td_at(-1, interval '2 days 17 hours')),
  ('00000000-0000-0000-0000-0000000093b1', 'whatsapp_tap', null, 'dev-d', public.td_at(-3, interval '10 days')),
  ('00000000-0000-0000-0000-0000000093b1', 'call_tap', null, 'dev-e', public.td_at(-7, interval '1 day'));
-- td-other, a summer London midnight: 23:30 and 00:30 BST are different days (2); 23:30Z and 10:00Z the next day
-- are both 2 July in Bolton (1).
insert into public.contact_events (provider_id, type, device_hash, created_at) values
  ('00000000-0000-0000-0000-0000000093b2', 'call_tap', 'dev-m', timestamptz '2026-07-01 23:30:00+01'),
  ('00000000-0000-0000-0000-0000000093b2', 'call_tap', 'dev-m', timestamptz '2026-07-02 00:30:00+01'),
  ('00000000-0000-0000-0000-0000000093b2', 'whatsapp_tap', 'dev-n', timestamptz '2026-07-01 23:30:00+00'),
  ('00000000-0000-0000-0000-0000000093b2', 'whatsapp_tap', 'dev-n', timestamptz '2026-07-02 10:00:00+00');
-- Winter: 23:59 and 00:01 GMT either side of 1 December are different days and different months.
insert into public.contact_events (provider_id, type, device_hash, created_at) values
  ('00000000-0000-0000-0000-0000000093b5', 'call_tap', 'dev-w', timestamptz '2025-11-30 23:59:00+00'),
  ('00000000-0000-0000-0000-0000000093b5', 'call_tap', 'dev-w', timestamptz '2025-12-01 00:01:00+00');

-- Reviews: Rita's this month counts; Sue's from two months ago doesn't.
insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, use_again, created_at)
values
  ('00000000-0000-0000-0000-0000000093b1', '00000000-0000-0000-0000-000000009303', (select id from public.categories where slug = 'plumber'),
   date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 5, 'yes', now()),
  ('00000000-0000-0000-0000-0000000093b1', '00000000-0000-0000-0000-000000009305', (select id from public.categories where slug = 'plumber'),
   date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 4, 'yes', public.td_at(-2, interval '5 days'));

select is(public.enquiry_count('00000000-0000-0000-0000-0000000093b1'), 6, 'all time: 3 this month, 1 last month, 1 three and 1 seven months ago');
select is((select count(*)::int from private.enquiries('00000000-0000-0000-0000-0000000093b1') where kind = 'call_tap'), 4,
  'an enquiry is put down to its first tap of the day (dev-a called first)');
select is(public.enquiry_count('00000000-0000-0000-0000-0000000093b2'), 3, 'London days, not UTC days, in summer');
select is(public.enquiry_count('00000000-0000-0000-0000-0000000093b5'), 2, 'London days in winter');

select public.td_as('00000000-0000-0000-0000-000000009301');
set local role authenticated;
create temp table td_stats on commit drop as select public.my_enquiry_stats('00000000-0000-0000-0000-0000000093b1') as s;
reset role;
select is((select s -> 'this_month' from td_stats), '{"enquiries": 3, "calls": 2, "whatsapps": 1}'::jsonb,
  'this month: 3 enquiries, 2 calls and 1 WhatsApp (own, admin and repeat taps left out)');
select is((select s -> 'all_time' from td_stats), '{"enquiries": 6, "calls": 4, "whatsapps": 2}'::jsonb, 'all time');
select is((select jsonb_array_length(s -> 'months') from td_stats), 6, 'six months');
select is((select s -> 'months' -> 5 ->> 'month' from td_stats),
  to_char(date_trunc('month', now() at time zone 'Europe/London'), 'YYYY-MM-DD'), 'the last month is this month');
select is((select s -> 'months' -> 0 ->> 'month' from td_stats),
  to_char(date_trunc('month', now() at time zone 'Europe/London') - interval '5 months', 'YYYY-MM-DD'), 'the first is five months ago');
select is((select array_agg((m ->> 'enquiries')::int order by i) from td_stats, jsonb_array_elements(s -> 'months') with ordinality a(m, i)),
  array[0, 0, 1, 0, 1, 3], 'enquiries month by month, oldest first (seven months ago is left off)');
select is((select s -> 'months' -> 2 from td_stats) - 'month', '{"enquiries": 1, "calls": 0, "whatsapps": 1}'::jsonb,
  'three months ago: one WhatsApp');
select is((select (s ->> 'reviews_this_month')::int from td_stats), 1, 'one review this month');

-- Who can read them.
select public.td_as('00000000-0000-0000-0000-000000009302');
set local role authenticated;
select throws_ok($$select public.my_enquiry_stats('00000000-0000-0000-0000-0000000093b1')$$, 'P0001', 'not_your_listing',
  'another trader cannot read them');
select throws_ok($$select public.admin_enquiry_stats('00000000-0000-0000-0000-0000000093b1')$$, '42501', 'not admin',
  'nor through the admin function');
reset role;
select public.td_as('00000000-0000-0000-0000-0000000093a0');
set local role authenticated;
select throws_ok($$select public.my_enquiry_stats('00000000-0000-0000-0000-0000000093b1')$$, 'P0001', 'not_your_listing',
  'the admin is not the linked trader');
select is(public.admin_enquiry_stats('00000000-0000-0000-0000-0000000093b1') -> 'this_month' ->> 'enquiries', '3',
  'the admin reads them through admin_enquiry_stats');
select throws_ok($$select public.admin_enquiry_stats('00000000-0000-0000-0000-0000000093ff')$$, 'P0002', 'provider not found',
  'admin: an unknown listing');
reset role;
set local role anon;
select throws_ok($$select public.my_enquiry_stats('00000000-0000-0000-0000-0000000093b1')$$, '42501', null,
  'not without signing in');
reset role;

-- ---------------------------------------------------------------- editing the listing
select public.td_as('00000000-0000-0000-0000-000000009301');
set local role authenticated;
select is(public.update_my_listing('00000000-0000-0000-0000-0000000093b1', '  Boilers and bathrooms.  ', array['bl3', 'BL1', ' BL1 ']),
  'td-live', 'the trader edits their bio and areas; the slug comes back');
reset role;
select is((select bio from public.providers where slug = 'td-live'), 'Boilers and bathrooms.', 'bio trimmed');
select is((select areas from public.providers where slug = 'td-live'), array['BL1', 'BL3'], 'areas upper-cased, de-duplicated, in order');
select is((select reason from public.audit_log where action = 'trader_edit_listing' and target_id = '00000000-0000-0000-0000-0000000093b1'
           order by created_at desc, id desc limit 1), 'bio, areas', 'audited with what changed');
select is((select actor_id from public.audit_log where action = 'trader_edit_listing' order by created_at desc, id desc limit 1),
  '00000000-0000-0000-0000-000000009301'::uuid, 'by the trader');
select is((select bio from public.provider_public where slug = 'td-live'), 'Boilers and bathrooms.', 'the public profile shows it');

set local role authenticated;
select is(public.update_my_listing('00000000-0000-0000-0000-0000000093b1', repeat('a', 300), array['BL1']), 'td-live', '300 characters is fine');
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b1', repeat('a', 301), array['BL1'])$$,
  'P0001', 'bio_too_long', 'not 301');
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b1', 'Ring 07700 900 123 any time', array['BL1'])$$,
  'P0001', 'bio_has_phone', 'no phone numbers');
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b1', 'Call (0)1204-555-0199', array['BL1'])$$,
  'P0001', 'bio_has_phone', 'however they are punctuated');
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b1', 'See www.example.org for more', array['BL1'])$$,
  'P0001', 'bio_has_link', 'no web addresses (www.)');
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b1', 'https://example.org', array['BL1'])$$,
  'P0001', 'bio_has_link', 'no web addresses (https://)');
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b1', 'Find us at acme-plumbing.co.uk', array['BL1'])$$,
  'P0001', 'bio_has_link', 'no bare domains');
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b1', 'Email me: tara@example', array['BL1'])$$,
  'P0001', 'bio_has_link', 'no email addresses');
select is(public.update_my_listing('00000000-0000-0000-0000-0000000093b1', 'Est. 1998. Gas safe. 24 hr call-outs, 7 days.', array['BL1']),
  'td-live', 'ordinary full stops and short numbers are fine');
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b1', 'Hi', array[]::text[])$$,
  'P0001', 'areas_required', 'at least one area');
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b1', 'Hi', array['BL1', 'M27'])$$,
  'P0001', 'bad_area', 'only the listed districts');
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b1', 'Hi', array['OTHER'])$$,
  'P0001', 'bad_area', 'not OTHER');
select is(public.update_my_listing('00000000-0000-0000-0000-0000000093b1', '   ', array['BL7', 'WN2']), 'td-live', 'an empty bio');
reset role;
select is((select bio from public.providers where slug = 'td-live'), null, 'is stored as none');
select is((select count(*)::int from public.audit_log where action = 'trader_edit_listing' and target_id = '00000000-0000-0000-0000-0000000093b1'),
  4, 'four edits saved; the refused ones wrote nothing');

set local role authenticated;
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b2', 'Hi', array['BL1'])$$,
  'P0001', 'not_your_listing', 'not another trader''s listing');
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b5', 'Hi', array['BL1'])$$,
  'P0001', 'not_your_listing', 'not an unlinked listing');
reset role;
select is((select bio from public.providers where slug = 'td-other'), null, 'td-other untouched');
select public.td_as('00000000-0000-0000-0000-000000009304');
set local role authenticated;
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b4', 'Hi', array['BL1'])$$,
  'P0001', 'blocked', 'a blocked account cannot edit');
reset role;
select public.td_as('00000000-0000-0000-0000-0000000093a0');
set local role authenticated;
select throws_ok($$select public.update_my_listing('00000000-0000-0000-0000-0000000093b1', 'Hi', array['BL1'])$$,
  'P0001', 'not_your_listing', 'the admin edits through the admin form, not this');
reset role;

select public.td_as('00000000-0000-0000-0000-000000009301');
set local role authenticated;
create temp table td_mine on commit drop as select public.provider_my_reviews() as j;
reset role;
create temp view td_mine_p as select l -> 'provider' as p from td_mine, jsonb_array_elements(j) l;
select is((select p -> 'areas' from td_mine_p where p ->> 'slug' = 'td-live'), '["BL7", "WN2"]'::jsonb, 'provider_my_reviews returns the areas');
select is((select p -> 'categories' from td_mine_p where p ->> 'slug' = 'td-live'), '["Plumber"]'::jsonb, 'and the category names');
select is((select p ->> 'paused_by' from td_mine_p where p ->> 'slug' = 'td-held'), 'admin', 'and who paused it (td-held: the admin)');

-- ---------------------------------------------------------------- pause, unpause, withdraw
select is((select paused_by from public.providers where slug = 'td-held'), 'admin', 'a listing inserted as paused was paused by the admin');
select throws_ok($$update public.providers set paused_by = 'trader' where slug = 'td-free'$$, '23514', null,
  'paused_by only on a paused listing');

set local role authenticated;
select is(public.pause_my_listing('00000000-0000-0000-0000-0000000093b1'), 'td-live', 'the trader pauses');
reset role;
select is((select status::text || '/' || paused_by from public.providers where slug = 'td-live'), 'paused/trader', 'paused, by the trader');
select is((select count(*)::int from public.provider_public where slug = 'td-live'), 0, 'hidden from the public lists');
select is((select reason from public.audit_log where action = 'set_provider_status' and target_id = '00000000-0000-0000-0000-0000000093b1'
           order by created_at desc, id desc limit 1), 'paused: Paused by trader', 'audited like an admin status change');
select is((select count(*)::int from public.reviews where provider_id = '00000000-0000-0000-0000-0000000093b1' and status = 'published'), 2,
  'reviews are kept');
select is(current_setting('bv.trader_status', true), '', 'the trader flag is cleared after the change');
set local role authenticated;
select throws_ok($$select public.pause_my_listing('00000000-0000-0000-0000-0000000093b1')$$, 'P0001', 'not_live', 'cannot pause twice');
select is(public.unpause_my_listing('00000000-0000-0000-0000-0000000093b1'), 'td-live', 'the trader unpauses');
reset role;
select is((select status::text || '/' || coalesce(paused_by, '-') from public.providers where slug = 'td-live'), 'live/-', 'live again');
select is((select count(*)::int from public.provider_public where slug = 'td-live'), 1, 'back in the public lists');
select is((select reason from public.audit_log where action = 'set_provider_status' and target_id = '00000000-0000-0000-0000-0000000093b1'
           order by created_at desc, id desc limit 1), 'live: Unpaused by trader', 'audited');
set local role authenticated;
select throws_ok($$select public.unpause_my_listing('00000000-0000-0000-0000-0000000093b1')$$, 'P0001', 'not_paused', 'nothing to unpause');
select throws_ok($$select public.unpause_my_listing('00000000-0000-0000-0000-0000000093b3')$$, 'P0001', 'paused_by_admin',
  'cannot undo the admin''s pause');
select throws_ok($$select public.pause_my_listing('00000000-0000-0000-0000-0000000093b2')$$, 'P0001', 'not_your_listing',
  'cannot pause another trader''s listing');
-- Paused by the trader, then paused again by the admin: the admin's pause wins.
select is(public.pause_my_listing('00000000-0000-0000-0000-0000000093b1'), 'td-live', 'paused by the trader again');
reset role;
select public.td_as('00000000-0000-0000-0000-0000000093a0');
set local role authenticated;
select lives_ok($$select public.admin_set_provider_status('00000000-0000-0000-0000-0000000093b1', 'paused', 'Checking a complaint')$$,
  'the admin pauses it too');
reset role;
select is((select paused_by from public.providers where slug = 'td-live'), 'admin', 'now paused by the admin');
select public.td_as('00000000-0000-0000-0000-000000009301');
set local role authenticated;
select throws_ok($$select public.unpause_my_listing('00000000-0000-0000-0000-0000000093b1')$$, 'P0001', 'paused_by_admin',
  'so the trader cannot unpause it');
reset role;
select public.td_as('00000000-0000-0000-0000-0000000093a0');
set local role authenticated;
select lives_ok($$select public.admin_set_provider_status('00000000-0000-0000-0000-0000000093b1', 'live', '')$$, 'the admin sets it live');
reset role;
select is((select paused_by from public.providers where slug = 'td-live'), null, 'live: nobody paused it');

-- Withdraw.
select public.td_as('00000000-0000-0000-0000-000000009302');
set local role authenticated;
select throws_ok($$select public.withdraw_my_listing('00000000-0000-0000-0000-0000000093b1')$$, 'P0001', 'not_your_listing',
  'another trader cannot withdraw it');
reset role;
select public.td_as('00000000-0000-0000-0000-000000009301');
set local role authenticated;
select is(public.withdraw_my_listing('00000000-0000-0000-0000-0000000093b1'), 'td-live', 'the trader withdraws');
reset role;
select is((select status::text from public.providers where slug = 'td-live'), 'removed', 'removed');
select is((select reason from public.audit_log where action = 'set_provider_status' and target_id = '00000000-0000-0000-0000-0000000093b1'
           order by created_at desc, id desc limit 1), 'removed: Withdrawn by trader', 'audited as a removal, with the reason');
select is((select count(*)::int from public.provider_public where slug = 'td-live'), 0, 'gone from the public lists');
select is((select count(*)::int from public.reviews where provider_id = '00000000-0000-0000-0000-0000000093b1' and status = 'published'), 2,
  'reviews kept (hidden with the profile)');
select throws_ok($$update public.providers set status = 'live' where slug = 'td-live'$$, '23514',
  'a removed provider can only return through a new invite', 'only a new invite brings it back');
set local role authenticated;
select is((select jsonb_array_length(public.provider_my_reviews())), 1, 'it leaves the trader''s page (td-held stays)');
select throws_ok($$select public.my_enquiry_stats('00000000-0000-0000-0000-0000000093b1')$$, 'P0001', 'not_your_listing',
  'its stats go with it');
select throws_ok($$select public.unpause_my_listing('00000000-0000-0000-0000-0000000093b1')$$, 'P0001', 'not_your_listing',
  'and it cannot be unpaused');
select is(public.withdraw_my_listing('00000000-0000-0000-0000-0000000093b3'), 'td-held', 'a paused listing can be withdrawn too');
reset role;
select is((select status::text || '/' || coalesce(paused_by, '-') from public.providers where slug = 'td-held'), 'removed/-',
  'removed, no longer paused');
select public.td_as('00000000-0000-0000-0000-0000000093a0');
set local role authenticated;
select is(public.admin_enquiry_stats('00000000-0000-0000-0000-0000000093b1') -> 'all_time' ->> 'enquiries', '6',
  'the admin still sees a withdrawn listing''s enquiries');
reset role;

select * from finish();
rollback;
