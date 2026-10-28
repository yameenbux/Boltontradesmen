-- The trader sign-up funnel (migration 000056): its four steps counted once per viewer a day, never the admin's own
-- visits, nothing else accepted; the summary for the admin only.
begin;
select plan(9);

update public.settings set value = '["sf-admin@example.com"]'::jsonb where key = 'admin_emails';
create function public.sf_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
grant execute on function public.sf_as(uuid) to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000e1a0', 'sf-admin@example.com');
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000e101');
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-00000000e1a0', 'admin', null), ('00000000-0000-0000-0000-00000000e101', 'resident', 'Kit K.');

select ok(public.record_page_view('funnel', 'for-traders', repeat('a', 64), null), 'a visit to For traders counts');
select ok(not public.record_page_view('funnel', 'for-traders', repeat('a', 64), null), 'once a day per viewer');
select ok(public.record_page_view('funnel', 'trader-sign-in', repeat('a', 64), null), 'the next step counts too');
select ok(public.record_page_view('funnel', 'trader-form', repeat('b', 64), '00000000-0000-0000-0000-00000000e101'),
  'the form, signed in');
select ok(not public.record_page_view('funnel', 'trader-form', repeat('c', 64), '00000000-0000-0000-0000-00000000e1a0'),
  'not the admin''s own visit');
select ok(not public.record_page_view('funnel', 'checkout', repeat('d', 64), null), 'only the four steps');

select public.sf_as('00000000-0000-0000-0000-00000000e101');
set local role authenticated;
select throws_ok($$select public.admin_signup_funnel(30)$$, '42501', 'not admin', 'not for anyone else');
reset role;
select public.sf_as('00000000-0000-0000-0000-00000000e1a0');
set local role authenticated;
select is(public.admin_signup_funnel(7) -> 'steps',
  '{"for-traders": 1, "get-listed": 0, "trader-sign-in": 1, "trader-form": 1}'::jsonb, 'the admin sees each step');
select is(public.admin_signup_funnel(7) ->> 'days', '7', 'for the days asked');
reset role;

select * from finish();
rollback;
