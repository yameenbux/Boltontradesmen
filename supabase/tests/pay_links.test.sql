-- A Pro trader's own payment link (migration 000055): only https links on the listed payment providers, set with
-- Pro, cleared any time; shown on the customer's copy of an invoice only, and only while Pro is on.
begin;
select plan(11);

create function public.pl_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function public.pl_as(uuid) to authenticated;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000d101'), ('00000000-0000-0000-0000-00000000d102');
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-00000000d101', 'provider', 'Gil G.'),
  ('00000000-0000-0000-0000-00000000d102', 'provider', 'Hal H.');
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id, areas) values
  ('00000000-0000-0000-0000-00000000d1b1', 'pl-gil', 'PL Gil', '+447700900961', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-00000000d101', array['BL1']),
  ('00000000-0000-0000-0000-00000000d1b2', 'pl-hal', 'PL Hal', '+447700900962', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-00000000d102', array['BL1']);
insert into public.trade_docs (token, provider_id, kind, number, status, customer_name, title, lines, total_pence) values
  ('00000000-0000-0000-0000-00000000d1e1', '00000000-0000-0000-0000-00000000d1b1', 'invoice', 1, 'unpaid', 'Ivy I', 'Tap',
   '[{"description":"Tap","quantity":1,"unit_pence":5000}]', 5000),
  ('00000000-0000-0000-0000-00000000d1e2', '00000000-0000-0000-0000-00000000d1b1', 'quote', 1, 'sent', 'Jo J', 'Sink',
   '[{"description":"Sink","quantity":1,"unit_pence":5000}]', 5000);

select ok(not has_function_privilege('anon', 'public.set_my_pay_link(uuid, text)', 'execute')
          and has_function_privilege('authenticated', 'public.set_my_pay_link(uuid, text)', 'execute'),
  'signed-in traders only');

select public.pl_as('00000000-0000-0000-0000-00000000d101');
set local role authenticated;
select throws_ok($$select public.set_my_pay_link('00000000-0000-0000-0000-00000000d1b1', 'https://paypal.me/gil')$$, 'P0001',
  'pro_needed', 'setting a link needs Pro');
select lives_ok($$select public.set_my_pay_link('00000000-0000-0000-0000-00000000d1b1', '')$$, 'clearing doesn''t');
reset role;

insert into public.subscriptions (provider_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, stripe_as_of)
values ('00000000-0000-0000-0000-00000000d1b1', 'cus_pl1', 'sub_pl1', 'monthly', 'active', now() + interval '20 days', now());
select public.pl_as('00000000-0000-0000-0000-00000000d101');
set local role authenticated;
select throws_ok($$select public.set_my_pay_link('00000000-0000-0000-0000-00000000d1b1', 'https://paypal.me.evil.example/gil')$$,
  'P0001', 'bad_link', 'not a look-alike site');
select throws_ok($$select public.set_my_pay_link('00000000-0000-0000-0000-00000000d1b1', 'http://paypal.me/gil')$$,
  'P0001', 'bad_link', 'https only');
select lives_ok($$select public.set_my_pay_link('00000000-0000-0000-0000-00000000d1b1', 'https://pay.sumup.com/b2c/QGIL1')$$,
  'a SumUp link');
select is(public.my_pay_link('00000000-0000-0000-0000-00000000d1b1'), 'https://pay.sumup.com/b2c/QGIL1', 'Gil sees it');
select throws_ok($$select public.my_pay_link('00000000-0000-0000-0000-00000000d1b2')$$, 'P0001', 'not_your_listing',
  'not someone else''s');
reset role;

select is(public.public_doc('00000000-0000-0000-0000-00000000d1e1') ->> 'pay_link', 'https://pay.sumup.com/b2c/QGIL1',
  'the invoice shows it');
select is(public.public_doc('00000000-0000-0000-0000-00000000d1e2') ->> 'pay_link', null, 'a quote doesn''t');
update public.subscriptions set status = 'canceled' where stripe_subscription_id = 'sub_pl1';
select is(public.public_doc('00000000-0000-0000-0000-00000000d1e1') ->> 'pay_link', null, 'nor once Pro ends');

select * from finish();
rollback;
