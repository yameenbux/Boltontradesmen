-- Quotes and invoices (migration 000036): Pro only to write, numbered per listing, the customer's copy by token
-- (no drafts, no customer contact details), accept or decline once, an invoice from an accepted quote, bank details
-- on invoices only, and the messages to customers (a review request once per paid invoice, not twice to one number
-- in 90 days; payment reminders after the due date).
begin;
select plan(32);

update public.settings set value = '["qi-admin@example.com"]'::jsonb where key = 'admin_emails';
create function public.qi_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
grant execute on function public.qi_as(uuid) to authenticated;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000096a0', 'qi-admin@example.com');
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000009601', 'pro@qi.example', now(), '{"provider":"google"}'),
  ('00000000-0000-0000-0000-000000009602', 'free@qi.example', now(), '{"provider":"google"}');
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-0000000096a0', 'admin', null),
  ('00000000-0000-0000-0000-000000009601', 'provider', 'Pro P.'),
  ('00000000-0000-0000-0000-000000009602', 'provider', 'Free F.');
insert into public.providers (id, slug, business_name, phone_e164, areas, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-0000000096b1', 'qi-pro', 'QI Pro', '+447700900951', array['BL3'], 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000009601'),
  ('00000000-0000-0000-0000-0000000096b2', 'qi-free', 'QI Free', '+447700900952', array['BL3'], 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-000000009602');
insert into public.pro_grants (provider_id, until, note) values ('00000000-0000-0000-0000-0000000096b1', current_date + 60, 'test');

create temp table qi (k text primary key, v jsonb);
grant all on qi to authenticated, service_role;

-- ---------------------------------------------------------------- access
select ok(not has_table_privilege('authenticated', 'public.trade_docs', 'select')
          and not has_table_privilege('service_role', 'public.trader_billing', 'select')
          and (select bool_and(relrowsecurity) from pg_class where oid in ('public.trade_docs'::regclass, 'public.trader_billing'::regclass)),
  'no table access, row level security on');
select ok(not has_function_privilege('anon', 'public.public_doc(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.answer_quote(uuid, boolean)', 'execute')
          and not has_function_privilege('authenticated', 'public.claim_customer_message(text, uuid)', 'execute')
          and has_function_privilege('service_role', 'public.public_doc(uuid)', 'execute'),
  'the customer''s copy and the messages: the server only');
select ok(not has_function_privilege('anon', 'public.save_my_doc(uuid, jsonb)', 'execute'), 'writing needs a signed-in account');

-- ---------------------------------------------------------------- writing
set local role authenticated;
select public.qi_as('00000000-0000-0000-0000-000000009602');
select throws_ok($$ select public.save_my_doc('00000000-0000-0000-0000-0000000096b2',
  '{"kind":"quote","customer_name":"Cy","title":"Fence","lines":[{"description":"Panel","quantity":1,"unit_pence":5000}]}') $$,
  'P0001', 'pro_needed', 'a listing without Pro cannot write quotes');
select throws_ok($$ select public.save_my_doc('00000000-0000-0000-0000-0000000096b1',
  '{"kind":"quote","customer_name":"Cy","title":"Fence","lines":[{"description":"Panel","quantity":1,"unit_pence":5000}]}') $$,
  'P0001', 'not_your_listing', 'nor someone else''s listing');

select public.qi_as('00000000-0000-0000-0000-000000009601');
select throws_ok($$ select public.save_my_doc('00000000-0000-0000-0000-0000000096b1',
  '{"kind":"quote","customer_name":"Cy","title":"Fence","lines":[]}') $$, 'P0001', 'bad_lines', 'a quote needs a line');
select throws_ok($$ select public.save_my_doc('00000000-0000-0000-0000-0000000096b1',
  '{"kind":"quote","customer_name":"Cy","title":"Fence","lines":[{"description":"Panel","quantity":0,"unit_pence":5000}]}') $$,
  'P0001', 'bad_lines', 'a line needs a quantity');
insert into qi values ('q1', to_jsonb(public.save_my_doc('00000000-0000-0000-0000-0000000096b1',
  '{"kind":"quote","customer_name":" Cy  Customer ","customer_phone":"+447700900961","customer_email":"Cy@QI.example","title":"New fence",
    "lines":[{"description":"Fence panel","quantity":"3","unit_pence":4500},{"description":"Labour","quantity":1.5,"unit_pence":2000}]}')));
select is((public.my_doc((select v #>> '{}' from qi where k = 'q1')::uuid))->'doc'->>'total_pence', '16500',
  'the total: 3 x £45 + 1.5 x £20 = £165');
select is((public.my_doc((select v #>> '{}' from qi where k = 'q1')::uuid))->'doc'->>'customer_name', 'Cy Customer', 'names tidied');
select is((public.my_doc((select v #>> '{}' from qi where k = 'q1')::uuid))->'doc'->>'number', '1', 'quote number 1');
select is((public.my_doc((select v #>> '{}' from qi where k = 'q1')::uuid))->'doc'->>'status', 'draft', 'starts as a draft');
insert into qi values ('q2', to_jsonb(public.save_my_doc('00000000-0000-0000-0000-0000000096b1',
  '{"kind":"quote","customer_name":"Di","title":"Gate","lines":[{"description":"Gate","quantity":1,"unit_pence":9000}]}')));
select is((public.my_doc((select v #>> '{}' from qi where k = 'q2')::uuid))->'doc'->>'number', '2', 'the next quote is number 2');
select is(jsonb_array_length(public.my_docs('00000000-0000-0000-0000-0000000096b1')), 2, 'the trader lists theirs');
reset role;
insert into qi values ('t1', to_jsonb((select token from public.trade_docs where id = (select v #>> '{}' from qi where k = 'q1')::uuid)));

-- ---------------------------------------------------------------- the customer's copy
set local role service_role;
select ok(public.public_doc((select v #>> '{}' from qi where k = 't1')::uuid) is null, 'a draft has no customer copy');
reset role;
set local role authenticated;
select public.qi_as('00000000-0000-0000-0000-000000009601');
select is((public.set_my_doc_status((select v #>> '{}' from qi where k = 'q1')::uuid, 'sent'))->>'status', 'sent', 'the trader sends it');
reset role;
set local role service_role;
select is((public.public_doc((select v #>> '{}' from qi where k = 't1')::uuid))->'doc'->>'title', 'New fence', 'the customer sees it');
select ok(not ((public.public_doc((select v #>> '{}' from qi where k = 't1')::uuid))->'doc' ? 'customer_phone')
          and ((public.public_doc((select v #>> '{}' from qi where k = 't1')::uuid))->'bank') = 'null'::jsonb,
  'without the customer''s contact details, and no bank details on a quote');
select is((public.answer_quote((select v #>> '{}' from qi where k = 't1')::uuid, true))->>'result', 'ok', 'the customer accepts');
select is((public.answer_quote((select v #>> '{}' from qi where k = 't1')::uuid, false))->>'result', 'already', 'only once');
select is(jsonb_array_length((public.claim_quote_answer_alert((select v #>> '{}' from qi where k = 'q1')::uuid))->'send'), 2,
  'the trader is told by text and email');
reset role;

-- ---------------------------------------------------------------- invoices
set local role authenticated;
select public.qi_as('00000000-0000-0000-0000-000000009601');
select throws_ok($$ select public.invoice_from_quote((select v #>> '{}' from qi where k = 'q2')::uuid) $$,
  'P0001', 'not_accepted', 'only an accepted quote becomes an invoice');
insert into qi values ('i1', to_jsonb(public.invoice_from_quote((select v #>> '{}' from qi where k = 'q1')::uuid)));
select is(public.invoice_from_quote((select v #>> '{}' from qi where k = 'q1')::uuid)::text, (select v #>> '{}' from qi where k = 'i1'),
  'asking again gives the same invoice');
select is((public.my_doc((select v #>> '{}' from qi where k = 'i1')::uuid))->'doc'->>'status', 'unpaid', 'an invoice starts unpaid');
select is((public.my_doc((select v #>> '{}' from qi where k = 'i1')::uuid))->'doc'->>'total_pence', '16500', 'with the quote''s lines');
select throws_ok($$ select public.set_my_billing('00000000-0000-0000-0000-0000000096b1', 'QI Pro', '12-34-5', '12345678') $$,
  'P0001', 'bad_sort_code', 'a sort code has 6 digits');
select lives_ok($$ select public.set_my_billing('00000000-0000-0000-0000-0000000096b1', 'QI Pro Ltd', '12-34-56', '1234 5678') $$,
  'bank details saved');
reset role;
insert into qi values ('t2', to_jsonb((select token from public.trade_docs where id = (select v #>> '{}' from qi where k = 'i1')::uuid)));
set local role service_role;
select is((public.public_doc((select v #>> '{}' from qi where k = 't2')::uuid))->'bank'->>'sort_code',
  '123456', 'the invoice shows how to pay');
-- Not paid yet: no review request.
select ok(jsonb_array_length((public.claim_customer_message('review_request', (select v #>> '{}' from qi where k = 'i1')::uuid))->'send') is null
          or public.claim_customer_message('review_request', (select v #>> '{}' from qi where k = 'i1')::uuid) is null,
  'no review request before it''s paid');
reset role;

set local role authenticated;
select public.qi_as('00000000-0000-0000-0000-000000009601');
select is((public.set_my_doc_status((select v #>> '{}' from qi where k = 'i1')::uuid, 'paid'))->>'status', 'paid', 'marked paid');
reset role;
set local role service_role;
select is((select array_agg(e->>'channel' order by e->>'channel') from jsonb_array_elements(
  (public.claim_customer_message('review_request', (select v #>> '{}' from qi where k = 'i1')::uuid))->'send') e),
  array['email', 'sms'], 'a paid invoice asks for a review by text and email');
select is(jsonb_array_length((public.claim_customer_message('review_request', (select v #>> '{}' from qi where k = 'i1')::uuid))->'send'), 0,
  'once only');
reset role;

-- Payment reminders: an unpaid invoice 3 days past due.
update public.trade_docs set status = 'unpaid', paid_at = null, until = current_date - 4 where id = (select v #>> '{}' from qi where k = 'i1')::uuid;
set local role service_role;
select is((public.due_payment_reminders())->0->>'kind', 'payment_reminder_1', 'an invoice 3 days overdue is due its first reminder');
reset role;

select * from finish();
rollback;
