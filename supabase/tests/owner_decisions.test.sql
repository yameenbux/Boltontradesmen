-- Owner decisions on the skipped review-2 minors:
--   M3  the group code allows 5 wrong tries per person in 24 hours, enforced here (not just in the app);
--   M11 every Twilio Lookup counts towards the monthly SMS cap, at settings.lookup_cost_gbp (default £0.01);
--   M5  proof files are deleted 12 months after the admin checks them; the row stays (so a Verified job
--       stays verified) and is marked file_deleted_at.
begin;
select plan(39);

create function public.od_as(p_uid text, p_role text default 'authenticated') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role, 'aal', 'aal2')::text, true);
$$;
grant execute on function public.od_as(text, text) to authenticated, service_role, anon;

-- ======================================================================== M3: group code attempts
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000da01'),  -- has a profile
  ('00000000-0000-0000-0000-00000000da02'),  -- another person
  ('00000000-0000-0000-0000-00000000da03'),  -- onboarding
  ('00000000-0000-0000-0000-00000000da04');  -- right codes only
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-00000000da01', 'resident', 'Gus G.'),
  ('00000000-0000-0000-0000-00000000da02', 'resident', 'Hal H.'),
  ('00000000-0000-0000-0000-00000000da04', 'resident', 'Ivy I.');
update public.settings set value = '"Bolton"'::jsonb where key = 'group_code';

select is((select value from public.settings where key = 'group_code_limits'), '{"wrong_24h":5}'::jsonb,
  'the limit is a setting: 5 wrong tries in 24 hours');

set local role authenticated;
select public.od_as('00000000-0000-0000-0000-00000000da01');
select is((select string_agg(public.set_group_code('nope' || n)::text, ',') from generate_series(1, 5) n),
  'false,false,false,false,false', 'five wrong codes are each checked (and refused)');
select throws_ok($$select public.set_group_code('Bolton')$$, 'P0001', 'group_code_limit',
  'the sixth try is refused, even with the right code');
select throws_ok($$select public.set_group_code('nope')$$, 'P0001', 'group_code_limit', 'and a wrong one');
reset role;
select is((select group_member_at from public.profiles where user_id = '00000000-0000-0000-0000-00000000da01'), null,
  'no badge while locked');
select is((select count(*)::int from public.group_code_attempts where user_id = '00000000-0000-0000-0000-00000000da01'), 5,
  'only the wrong tries are recorded (refused tries do not extend the lock)');

set local role authenticated;
select public.od_as('00000000-0000-0000-0000-00000000da02');
select is(public.set_group_code('Bolton'), true, 'another person is unaffected');
select throws_ok($$select count(*) from public.group_code_attempts$$, '42501', null, 'members cannot read the attempts table');
select public.od_as('00000000-0000-0000-0000-00000000da04');
select is((select string_agg(public.set_group_code('bolton')::text, ',') from generate_series(1, 7)),
  'true,true,true,true,true,true,true', 'right codes never count');
reset role;

update public.group_code_attempts set created_at = now() - interval '25 hours'
where user_id = '00000000-0000-0000-0000-00000000da01';
set local role authenticated;
select public.od_as('00000000-0000-0000-0000-00000000da01');
select is(public.set_group_code(' BOLTON '), true, 'after 24 hours the person may try again');
reset role;

-- complete_onboarding: wrong codes are recorded (not rolled back) and the profile is not created
set local role authenticated;
select public.od_as('00000000-0000-0000-0000-00000000da03');
select is(public.complete_onboarding('Jo J.', 'BL3', 'nope') ->> 'error', 'bad_group_code',
  'Welcome: a wrong code is answered with bad_group_code');
reset role;
select is((select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-00000000da03'), 0,
  'Welcome: no profile is saved with a wrong code');
select is((select count(*)::int from public.group_code_attempts where user_id = '00000000-0000-0000-0000-00000000da03'), 1,
  'Welcome: the wrong try is recorded');
insert into public.group_code_attempts (user_id) select '00000000-0000-0000-0000-00000000da03' from generate_series(1, 4);
set local role authenticated;
select is(public.complete_onboarding('Jo J.', 'BL3', 'Bolton') ->> 'error', 'group_code_limit',
  'Welcome: after 5 wrong tries even the right code is refused');
select is(public.complete_onboarding('Jo J.', 'BL3', '') ->> 'display_name', 'Jo J.',
  'Welcome: with the code left blank the person can still finish');
reset role;
select is((select group_member_at from public.profiles where user_id = '00000000-0000-0000-0000-00000000da03'), null,
  'Welcome: no badge');
set local role authenticated;
select public.od_as('00000000-0000-0000-0000-00000000da02');
select is(public.complete_onboarding('Hal H.', 'BL1', 'bolton') ->> 'group_member', 'true',
  'Welcome: the right code still works for someone not locked');
reset role;

update public.settings set value = '{"wrong_24h":1}'::jsonb where key = 'group_code_limits';
set local role authenticated;
select public.od_as('00000000-0000-0000-0000-00000000da04');
select is(public.set_group_code('nope'), false, 'limits come from settings: first wrong try');
select throws_ok($$select public.set_group_code('nope')$$, 'P0001', 'group_code_limit', 'limits come from settings: then locked');
reset role;

-- ======================================================================== M11: Lookups count towards the cap
select is((select value from public.settings where key = 'lookup_cost_gbp'), '0.01'::jsonb, 'Lookup cost setting, default £0.01');
delete from public.otp_requests;
-- 181 texts sent (each had a Lookup): 181 x (£0.10 + £0.01) = £19.91
insert into public.otp_requests (phone_e164, ip_hash, outcome)
select '+4477009006' || lpad((n % 100)::text, 2, '0'), 'bulk', 'sent' from generate_series(1, 181) n;
-- refused before any Lookup: cost nothing
insert into public.otp_requests (phone_e164, ip_hash, outcome)
select '+447700900850', 'bulk', o from unnest(array['limited_number', 'limited_ip', 'cap_reached']) o;
-- last month's Lookups don't count
insert into public.otp_requests (phone_e164, ip_hash, outcome, created_at)
select '+447700900851', 'bulk-old', 'voip',
  (date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London') - interval '1 day'
from generate_series(1, 50);
create temp table capv (verdict text);
grant all on capv to service_role;
set local role service_role;
insert into capv select verdict from public.otp_gate('+447700900852', 'ip-cap1');
reset role;
select is((select verdict from capv), 'ok', '£19.91 this month (texts plus their Lookups) is under £20');
-- that request passed the gate, so it gets a Lookup; mark it as a number the Lookup turned away
update public.otp_requests set outcome = 'voip' where phone_e164 = '+447700900852';
-- 8 more Lookups that sent no text: £19.91 + 9 x £0.01 = £20.00
insert into public.otp_requests (phone_e164, ip_hash, outcome)
select '+447700900853', 'bulk', o from unnest(array['voip', 'not_mobile', 'lookup_failed', 'approved', 'send_failed', 'pending', 'voip', 'voip']) o;
set local role service_role;
select is((select verdict from public.otp_gate('+447700900854', 'ip-cap2')), 'cap_reached',
  'Lookups that sent no text count too: £20.00 reaches the cap');
reset role;
update public.settings set value = '0'::jsonb where key = 'lookup_cost_gbp';
set local role service_role;
select is((select verdict from public.otp_gate('+447700900855', 'ip-cap3')), 'ok', 'the Lookup cost comes from settings');
reset role;
delete from public.otp_requests;

-- ======================================================================== M5: proof files deleted 12 months after the check
update public.settings set value = '[]'::jsonb where key = 'admin_emails';
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000db01'),  -- admin
  ('00000000-0000-0000-0000-00000000db02');  -- a member
insert into auth.users (id) select ('00000000-0000-0000-0000-00000000dc0' || n)::uuid from generate_series(1, 5) n;
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-00000000db01', 'admin', null),
  ('00000000-0000-0000-0000-00000000db02', 'resident', 'Kit K.');
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence) values
  ('00000000-0000-0000-0000-00000000dd01', 'od-plumb', 'OD Plumb', '+447700900761', 'live', now(), '{}'::jsonb);
insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-00000000dd01'::uuid, id from public.categories where slug = 'plumber';
insert into public.reviews (id, provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, tidy, use_again)
select ('00000000-0000-0000-0000-00000000de0' || n)::uuid, '00000000-0000-0000-0000-00000000dd01',
  ('00000000-0000-0000-0000-00000000dc0' || n)::uuid, (select id from public.categories where slug = 'plumber'),
  date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 4, null, 'yes'
from generate_series(1, 5) n;
insert into public.review_proofs (id, review_id, storage_path, mime_type, outcome, checked_at) values
  ('00000000-0000-0000-0000-00000000df01', '00000000-0000-0000-0000-00000000de01', '00000000-0000-0000-0000-00000000de01/a.jpg', 'image/jpeg', 'accepted', now() - interval '13 months'),
  ('00000000-0000-0000-0000-00000000df02', '00000000-0000-0000-0000-00000000de02', '00000000-0000-0000-0000-00000000de02/b.pdf', 'application/pdf', 'rejected', now() - interval '12 months 1 day'),
  ('00000000-0000-0000-0000-00000000df03', '00000000-0000-0000-0000-00000000de03', '00000000-0000-0000-0000-00000000de03/c.jpg', 'image/jpeg', 'accepted', now() - interval '11 months'),
  ('00000000-0000-0000-0000-00000000df04', '00000000-0000-0000-0000-00000000de04', '00000000-0000-0000-0000-00000000de04/d.jpg', 'image/jpeg', 'pending', null);
update public.review_proofs set created_at = now() - interval '2 years' where id = '00000000-0000-0000-0000-00000000df04';

select is((select value from public.settings where key = 'proof_retention_months'), '12'::jsonb, 'retention is a setting: 12 months');

set local role authenticated;
select public.od_as('00000000-0000-0000-0000-00000000db02');
select throws_ok($$select * from public.proof_files_due()$$, '42501', null, 'a member cannot list proof files due');
select throws_ok($$select public.mark_proof_files_deleted(array['00000000-0000-0000-0000-00000000df01'::uuid])$$, '42501', null,
  'a member cannot mark proof files deleted');
reset role;
set local role anon;
select throws_ok($$select * from public.proof_files_due()$$, '42501', null, 'anon cannot list proof files due');
reset role;

set local role authenticated;
select public.od_as('00000000-0000-0000-0000-00000000db01');
select is((select array_agg(storage_path order by storage_path) from public.proof_files_due()),
  array['00000000-0000-0000-0000-00000000de01/a.jpg', '00000000-0000-0000-0000-00000000de02/b.pdf'],
  'admin: accepted and rejected proofs checked over 12 months ago are due; newer and unchecked ones are not');
select is((select count(*)::int from public.proof_files_due(1)), 1, 'the list takes a batch size');
select is(public.mark_proof_files_deleted(array['00000000-0000-0000-0000-00000000df01', '00000000-0000-0000-0000-00000000df03', '00000000-0000-0000-0000-00000000df04']::uuid[]), 1,
  'admin: only expired proofs can be marked (a newer or unchecked one is left alone)');
reset role;
select isnt((select file_deleted_at from public.review_proofs where id = '00000000-0000-0000-0000-00000000df01'), null, 'the expired proof is marked');
select is((select count(*)::int from public.review_proofs where file_deleted_at is not null), 1, 'nothing else is marked');
select is((select outcome from public.review_proofs where id = '00000000-0000-0000-0000-00000000df01'), 'accepted', 'its outcome is kept');
select is((select verified_job from public.review_public where id = '00000000-0000-0000-0000-00000000de01'), true,
  'the review still shows Verified job');
select is((select count(*)::int from public.audit_log where action = 'delete_proof_file' and target_id = '00000000-0000-0000-0000-00000000df01'), 1,
  'the deletion is in the audit log');

set local role service_role;
select public.od_as(null, 'service_role');
select is((select array_agg(storage_path) from public.proof_files_due()), array['00000000-0000-0000-0000-00000000de02/b.pdf'],
  'service role: a marked proof is no longer due');
select is(public.mark_proof_files_deleted(array['00000000-0000-0000-0000-00000000df02']::uuid[]), 1, 'service role can mark');
select is(public.mark_proof_files_deleted(array['00000000-0000-0000-0000-00000000df02']::uuid[]), 0, 'marking twice does nothing');
select is((select count(*)::int from public.proof_files_due()), 0, 'nothing left due');
reset role;

select * from finish();
rollback;
