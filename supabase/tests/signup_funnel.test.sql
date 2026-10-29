-- The trader sign-up funnel (migrations 000056, 000057): its four steps counted once per viewer a day, never the admin's
-- own visits, nothing else accepted; arrivals from Facebook, Instagram and WhatsApp; a new trader's "how did you hear
-- about us" set once by them; the summary for the admin only.
begin;
select plan(19);

update public.settings set value = '["sf-admin@example.com"]'::jsonb where key = 'admin_emails';
create function public.sf_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
grant execute on function public.sf_as(uuid) to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000e1a0', 'sf-admin@example.com');
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000e101'), ('00000000-0000-0000-0000-00000000e102');
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-00000000e1a0', 'admin', null), ('00000000-0000-0000-0000-00000000e101', 'resident', 'Kit K.'),
  ('00000000-0000-0000-0000-00000000e102', 'provider', 'Lou L.');
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id, areas) values
  ('00000000-0000-0000-0000-00000000e1b2', 'sf-lou', 'SF Lou', '+447700900971', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-00000000e102', array['BL1']);

select ok(public.record_page_view('funnel', 'for-traders', repeat('a', 64), null), 'a visit to For traders counts');
select ok(not public.record_page_view('funnel', 'for-traders', repeat('a', 64), null), 'once a day per viewer');
select ok(public.record_page_view('funnel', 'trader-sign-in', repeat('a', 64), null), 'the next step counts too');
select ok(public.record_page_view('funnel', 'trader-form', repeat('b', 64), '00000000-0000-0000-0000-00000000e101'),
  'the form, signed in');
select ok(not public.record_page_view('funnel', 'trader-form', repeat('c', 64), '00000000-0000-0000-0000-00000000e1a0'),
  'not the admin''s own visit');
select ok(not public.record_page_view('funnel', 'checkout', repeat('d', 64), null), 'only the four steps');

-- ---------------------------------------------------------------- arrivals
select ok(public.record_page_view('arrival', 'fb', repeat('a', 64), null), 'an arrival from Facebook counts');
select ok(not public.record_page_view('arrival', 'fb', repeat('a', 64), null), 'once a day per viewer');
select ok(public.record_page_view('arrival', 'wa', repeat('e', 64), null), 'and from WhatsApp');
select ok(not public.record_page_view('arrival', 'tiktok', repeat('e', 64), null), 'nowhere else');
select ok(not public.record_page_view('arrival', 'fb', repeat('f', 64), '00000000-0000-0000-0000-00000000e1a0'),
  'not the admin''s own');

-- ---------------------------------------------------------------- how they heard
select public.sf_as('00000000-0000-0000-0000-00000000e102');
set local role authenticated;
select throws_ok($$select public.set_my_heard_from('00000000-0000-0000-0000-00000000e1b2', 'tiktok')$$, 'P0001',
  'bad_source', 'only the listed answers');
select public.set_my_heard_from('00000000-0000-0000-0000-00000000e1b2', 'facebook');
select public.set_my_heard_from('00000000-0000-0000-0000-00000000e1b2', 'google');
reset role;
select is((select heard_from from public.providers where id = '00000000-0000-0000-0000-00000000e1b2'), 'facebook',
  'set once: a second answer changes nothing');
select public.sf_as('00000000-0000-0000-0000-00000000e101');
set local role authenticated;
select throws_ok($$select public.set_my_heard_from('00000000-0000-0000-0000-00000000e1b2', 'other')$$, 'P0001',
  'not_your_listing', 'only for your own listing');
reset role;

select public.sf_as('00000000-0000-0000-0000-00000000e101');
set local role authenticated;
select throws_ok($$select public.admin_signup_funnel(30)$$, '42501', 'not admin', 'not for anyone else');
reset role;
select public.sf_as('00000000-0000-0000-0000-00000000e1a0');
set local role authenticated;
select is(public.admin_signup_funnel(7) -> 'steps',
  '{"for-traders": 1, "get-listed": 0, "trader-sign-in": 1, "trader-form": 1}'::jsonb, 'the admin sees each step');
select is(public.admin_signup_funnel(7) ->> 'days', '7', 'for the days asked');
select is(public.admin_signup_funnel(7) -> 'arrivals', '{"fb": 1, "ig": 0, "wa": 1}'::jsonb, 'arrivals by source');
select is(public.admin_signup_funnel(7) -> 'listed_from' ->> 'facebook', '1', 'new listings by where they heard');
reset role;

select * from finish();
rollback;
