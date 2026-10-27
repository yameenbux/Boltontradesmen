-- Card payments (migration 000054): a quote's deposit set by its Pro trader; what's payable by card only with Pro
-- and a Stripe account that can take payments; a payment recorded once, only for the right doc, account and amount;
-- an invoice from a quote whose deposit was paid asks only for the rest.
begin;
select plan(22);

create function public.cp_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function public.cp_as(uuid) to authenticated;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000c101'), ('00000000-0000-0000-0000-00000000c102');
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-00000000c101', 'provider', 'Cora C.'),
  ('00000000-0000-0000-0000-00000000c102', 'provider', 'Dan D.');
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id, areas) values
  ('00000000-0000-0000-0000-00000000c1b1', 'cp-cora', 'CP Cora', '+447700900991', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-00000000c101', array['BL1']),
  ('00000000-0000-0000-0000-00000000c1b2', 'cp-dan', 'CP Dan', '+447700900992', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-00000000c102', array['BL1']);
insert into public.subscriptions (provider_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, stripe_as_of)
values ('00000000-0000-0000-0000-00000000c1b1', 'cus_cp1', 'sub_cp1', 'monthly', 'active', now() + interval '20 days', now());
insert into public.trade_docs (id, token, provider_id, kind, number, status, customer_name, title, lines, total_pence, ask_review) values
  ('00000000-0000-0000-0000-00000000c1d1', '00000000-0000-0000-0000-00000000c1e1', '00000000-0000-0000-0000-00000000c1b1',
   'quote', 1, 'sent', 'Ed E', 'Kitchen', '[{"description":"Fit","quantity":1,"unit_pence":50000}]', 50000, true),
  ('00000000-0000-0000-0000-00000000c1d2', '00000000-0000-0000-0000-00000000c1e2', '00000000-0000-0000-0000-00000000c1b1',
   'invoice', 1, 'unpaid', 'Flo F', 'Tap', '[{"description":"Tap","quantity":1,"unit_pence":8000}]', 8000, true);

-- ---------------------------------------------------------------- grants
select ok(not has_function_privilege('authenticated', 'public.record_card_payment(text, uuid, text, bigint)', 'execute')
          and not has_function_privilege('authenticated', 'public.doc_card_payment(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.set_stripe_account(uuid, text)', 'execute')
          and has_function_privilege('service_role', 'public.record_card_payment(text, uuid, text, bigint)', 'execute'),
  'only the server records payments and links accounts');
select ok(has_function_privilege('authenticated', 'public.set_my_quote_deposit(uuid, bigint)', 'execute')
          and not has_function_privilege('anon', 'public.my_card_payments(uuid)', 'execute'),
  'traders set deposits and read their own state');

-- ---------------------------------------------------------------- the deposit
select public.cp_as('00000000-0000-0000-0000-00000000c101');
set local role authenticated;
select throws_ok($$select public.set_my_quote_deposit('00000000-0000-0000-0000-00000000c1d1', 60000)$$, 'P0001',
  'bad_deposit', 'not more than the quote');
select throws_ok($$select public.set_my_quote_deposit('00000000-0000-0000-0000-00000000c1d1', 50)$$, 'P0001',
  'bad_deposit', 'at least £1');
select lives_ok($$select public.set_my_quote_deposit('00000000-0000-0000-0000-00000000c1d1', 10000)$$, 'a £100 deposit');
select is(public.my_card_payments('00000000-0000-0000-0000-00000000c1b1'),
  '{"connected": false, "charges_enabled": false, "details_submitted": false}'::jsonb, 'not connected yet');
reset role;
select public.cp_as('00000000-0000-0000-0000-00000000c102');
set local role authenticated;
select throws_ok($$select public.set_my_quote_deposit('00000000-0000-0000-0000-00000000c1d1', 5000)$$, 'P0001',
  'not_your_listing', 'not on someone else''s quote');
reset role;

-- ---------------------------------------------------------------- what's payable
select is(public.doc_card_payment('00000000-0000-0000-0000-00000000c1e2'), null, 'nothing without a Stripe account');
select is(public.set_stripe_account('00000000-0000-0000-0000-00000000c1b1', 'acct_1CoraTest'), 'acct_1CoraTest', 'account linked');
select is(public.set_stripe_account('00000000-0000-0000-0000-00000000c1b1', 'acct_1Other'), 'acct_1CoraTest',
  'a second link keeps the first');
select is(public.doc_card_payment('00000000-0000-0000-0000-00000000c1e2'), null, 'nothing until Stripe lets it take payments');
select public.update_stripe_account('acct_1CoraTest', true, true);
select is(public.doc_card_payment('00000000-0000-0000-0000-00000000c1e2') ->> 'amount_pence', '8000', 'the invoice is payable');
select is(public.doc_card_payment('00000000-0000-0000-0000-00000000c1e1'), null, 'a deposit only once the quote is accepted');
update public.trade_docs set status = 'accepted' where id = '00000000-0000-0000-0000-00000000c1d1';
select is(public.doc_card_payment('00000000-0000-0000-0000-00000000c1e1') ->> 'what', 'deposit', 'then the deposit is');

-- ---------------------------------------------------------------- recording
select is(public.record_card_payment('cs_test_bad1', '00000000-0000-0000-0000-00000000c1d1', 'acct_1CoraTest', 999) ->> 'result',
  'mismatch', 'the wrong amount isn''t recorded');
select is(public.record_card_payment('cs_test_bad2', '00000000-0000-0000-0000-00000000c1d1', 'acct_1Elsewhere', 10000) ->> 'result',
  'mismatch', 'nor a payment to another account');
select is(public.record_card_payment('cs_test_dep1', '00000000-0000-0000-0000-00000000c1d1', 'acct_1CoraTest', 10000) ->> 'result',
  'recorded', 'the deposit is recorded');
select is(public.record_card_payment('cs_test_dep1', '00000000-0000-0000-0000-00000000c1d1', 'acct_1CoraTest', 10000) ->> 'result',
  'already', 'once');

-- The invoice from that quote asks for the rest.
select public.cp_as('00000000-0000-0000-0000-00000000c101');
set local role authenticated;
select public.invoice_from_quote('00000000-0000-0000-0000-00000000c1d1');
reset role;
select is(public.doc_card_payment((select token from public.trade_docs where quote_id = '00000000-0000-0000-0000-00000000c1d1'))
  ->> 'amount_pence', '40000', 'the invoice asks for what''s left after the deposit');
select is((public.public_doc((select token from public.trade_docs where quote_id = '00000000-0000-0000-0000-00000000c1d1'))
  #>> '{doc,paid_upfront_pence}'), '10000', 'and its copy shows what was paid up front');

select is(public.record_card_payment('cs_test_inv1', '00000000-0000-0000-0000-00000000c1d2', 'acct_1CoraTest', 8000) ->> 'ask_review',
  'true', 'an invoice paid by card: recorded, and the review request is due');
select is((select status || ':' || paid_by_card from public.trade_docs where id = '00000000-0000-0000-0000-00000000c1d2'),
  'paid:true', 'the invoice is paid, by card');

select * from finish();
rollback;
