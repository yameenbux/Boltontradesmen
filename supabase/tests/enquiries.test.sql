begin;
select plan(17);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000005a1'),  -- provider owner
  ('00000000-0000-0000-0000-0000000005a2'),  -- admin
  ('00000000-0000-0000-0000-0000000005a3');  -- ordinary resident
insert into public.profiles (user_id, role) values
  ('00000000-0000-0000-0000-0000000005a2', 'admin')
on conflict (user_id) do update set role = 'admin';

insert into public.providers (id, slug, business_name, phone_e164, whatsapp_e164, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-0000000005b1', 'en-live', 'Enq Live', '+447700900301', '+447700900301', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-0000000005a1'),
  ('00000000-0000-0000-0000-0000000005b2', 'en-paused', 'Enq Paused', '+447700900302', null, 'paused', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000005b3', 'en-two', 'Enq Two', '+447700900303', null, 'live', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000005b4', 'en-three', 'Enq Three', '+447700900304', null, 'live', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000005b5', 'en-four', 'Enq Four', '+447700900305', null, 'live', now(), '{}'::jsonb, null);

-- Case 1: same device taps call 3x today, then whatsapp -> 1
insert into public.contact_events (provider_id, type, device_hash)
select '00000000-0000-0000-0000-0000000005b1', 'call_tap', 'dev-a' from generate_series(1, 3);
select is(public.enquiry_count('00000000-0000-0000-0000-0000000005b1'), 1, 'same device 3 call taps today counts once');
insert into public.contact_events (provider_id, type, device_hash) values
  ('00000000-0000-0000-0000-0000000005b1', 'whatsapp_tap', 'dev-a');
select is(public.enquiry_count('00000000-0000-0000-0000-0000000005b1'), 1, 'whatsapp tap by same device today still counts once');

-- Case 2: same device yesterday and today -> 2 (London day boundary). "Yesterday" is a calendar day back in London
-- time: 24 hours back can be the same London date on the night the clocks go back.
insert into public.contact_events (provider_id, type, device_hash, created_at) values
  ('00000000-0000-0000-0000-0000000005b3', 'call_tap', 'dev-y',
   ((now() at time zone 'Europe/London') - interval '1 day') at time zone 'Europe/London'),
  ('00000000-0000-0000-0000-0000000005b3', 'call_tap', 'dev-y', now());
select is(public.enquiry_count('00000000-0000-0000-0000-0000000005b3'), 2, 'same device on two London days counts twice');

-- London midnight boundary: 23:30 and 00:30 London time on a summer date are 22:30Z and 23:30Z -> different London days
insert into public.contact_events (provider_id, type, device_hash, created_at) values
  ('00000000-0000-0000-0000-0000000005b4', 'call_tap', 'dev-m', timestamptz '2026-07-01 23:30:00+01'),
  ('00000000-0000-0000-0000-0000000005b4', 'call_tap', 'dev-m', timestamptz '2026-07-02 00:30:00+01');
select is(public.enquiry_count('00000000-0000-0000-0000-0000000005b4'), 2, 'taps either side of London midnight are different days');
-- 23:30Z and 00:30Z same London day in summer? 23:30Z = 00:30 BST next day; both on 07-02 London
insert into public.contact_events (provider_id, type, device_hash, created_at) values
  ('00000000-0000-0000-0000-0000000005b5', 'call_tap', 'dev-m', timestamptz '2026-07-01 23:30:00+00'),
  ('00000000-0000-0000-0000-0000000005b5', 'call_tap', 'dev-m', timestamptz '2026-07-02 10:00:00+00');
select is(public.enquiry_count('00000000-0000-0000-0000-0000000005b5'), 1, 'UTC dates differ but same London day counts once');

-- Case 3: two devices today -> 2
insert into public.contact_events (provider_id, type, device_hash) values
  ('00000000-0000-0000-0000-0000000005b2', 'call_tap', 'dev-1'),
  ('00000000-0000-0000-0000-0000000005b2', 'call_tap', 'dev-2');
select is(public.enquiry_count('00000000-0000-0000-0000-0000000005b2'), 2, 'two devices today count twice');

-- Case 4: owner and admin actors not counted; ordinary actor counted
insert into public.contact_events (provider_id, type, actor_id, device_hash) values
  ('00000000-0000-0000-0000-0000000005b2', 'call_tap', '00000000-0000-0000-0000-0000000005a2', 'dev-adm');
select is(public.enquiry_count('00000000-0000-0000-0000-0000000005b2'), 2, 'admin actor not counted');
-- b1 is owned by a1
insert into public.contact_events (provider_id, type, actor_id, device_hash) values
  ('00000000-0000-0000-0000-0000000005b1', 'call_tap', '00000000-0000-0000-0000-0000000005a1', 'dev-own');
select is(public.enquiry_count('00000000-0000-0000-0000-0000000005b1'), 1, 'provider owner actor not counted');
insert into public.contact_events (provider_id, type, actor_id, device_hash) values
  ('00000000-0000-0000-0000-0000000005b1', 'call_tap', '00000000-0000-0000-0000-0000000005a3', 'dev-x');
select is(public.enquiry_count('00000000-0000-0000-0000-0000000005b1'), 2, 'ordinary resident actor counted');

-- Case 5: profile_view not counted
insert into public.contact_events (provider_id, type, device_hash) values
  ('00000000-0000-0000-0000-0000000005b1', 'profile_view', 'dev-view1'),
  ('00000000-0000-0000-0000-0000000005b1', 'profile_view', 'dev-view2');
select is(public.enquiry_count('00000000-0000-0000-0000-0000000005b1'), 2, 'profile_view rows not counted');

-- log_contact
select is((select count(*)::int from public.log_contact('nope', 'call_tap', null, 'dev-z')), 0, 'log_contact unknown slug returns no rows');
select is((select count(*)::int from public.log_contact('en-paused', 'call_tap', null, 'dev-z')), 0, 'log_contact non-live slug returns no rows');
select is((select count(*)::int from public.contact_events where device_hash = 'dev-z'), 0, 'log_contact inserts nothing for unknown or non-live');
select is((select phone_e164 || '|' || whatsapp_e164 from public.log_contact('en-live', 'whatsapp_tap', null, 'dev-w')), '+447700900301|+447700900301', 'log_contact returns numbers for live provider');
select is((select count(*)::int from public.contact_events where device_hash = 'dev-w'), 1, 'log_contact inserts the event for live provider');

-- privileges
set local role anon;
select throws_ok($$select * from public.contact_events$$, '42501', null, 'anon cannot read contact_events');
reset role;
set local role authenticated;
select throws_ok($$select * from public.log_contact('en-live', 'call_tap', null, 'dev-q')$$, '42501', null, 'authenticated cannot execute log_contact');
reset role;

select * from finish();
rollback;
