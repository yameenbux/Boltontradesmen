-- Pro insights (migration 000053): page views counted once per viewer per page per day, never the trader's own or the
-- admin's (nor traders on trade pages); the dashboard's insights for the linked trader only, with the demand report
-- only for Pro; and quote follow-ups by email for open, unanswered quotes of Pro listings.
begin;
select plan(28);

create function public.pi_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function public.pi_as(uuid) to authenticated;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000b101'), ('00000000-0000-0000-0000-00000000b102'),
  ('00000000-0000-0000-0000-00000000b103'), ('00000000-0000-0000-0000-00000000b104');
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-00000000b101', 'provider', 'Pia P.'),
  ('00000000-0000-0000-0000-00000000b102', 'provider', 'Otto O.'),
  ('00000000-0000-0000-0000-00000000b103', 'resident', 'Rae R.'),
  ('00000000-0000-0000-0000-00000000b104', 'admin', 'Ada A.');
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id, areas) values
  ('00000000-0000-0000-0000-00000000b1b1', 'pi-pia', 'PI Pia', '+447700900981', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-00000000b101', array['BL1', 'BL2']),
  ('00000000-0000-0000-0000-00000000b1b2', 'pi-otto', 'PI Otto', '+447700900982', 'live', now(), '{}'::jsonb, '00000000-0000-0000-0000-00000000b102', array['BL3']),
  ('00000000-0000-0000-0000-00000000b1b3', 'pi-gone', 'PI Gone', '+447700900983', 'paused', now(), '{}'::jsonb, null, array['BL1']);
insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-00000000b1b1', id from public.categories where slug = 'plumber';

-- ---------------------------------------------------------------- grants
select ok(not has_function_privilege('anon', 'public.record_page_view(text, text, text, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.record_page_view(text, text, text, uuid)', 'execute')
          and has_function_privilege('service_role', 'public.record_page_view(text, text, text, uuid)', 'execute'),
  'only the server records views');
select ok(not has_function_privilege('anon', 'public.my_insights(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.my_insights(uuid)', 'execute'),
  'my_insights: signed-in accounts only');
select ok(not has_function_privilege('authenticated', 'public.due_quote_followups()', 'execute')
          and has_function_privilege('service_role', 'public.due_quote_followups()', 'execute'),
  'only the daily job lists follow-ups');

-- ---------------------------------------------------------------- counting views
select ok(public.record_page_view('profile', 'pi-pia', repeat('a', 64), null), 'a visitor''s view counts');
select ok(not public.record_page_view('profile', 'pi-pia', repeat('a', 64), null), 'the same viewer again that day doesn''t');
select ok(public.record_page_view('profile', 'pi-pia', repeat('b', 64), '00000000-0000-0000-0000-00000000b103'),
  'a signed-in resident''s view counts');
select ok(not public.record_page_view('profile', 'pi-pia', repeat('c', 64), '00000000-0000-0000-0000-00000000b101'),
  'the trader''s own view doesn''t');
select ok(not public.record_page_view('profile', 'pi-pia', repeat('d', 64), '00000000-0000-0000-0000-00000000b104'),
  'nor the admin''s');
select ok(not public.record_page_view('profile', 'pi-gone', repeat('e', 64), null), 'nor a listing that isn''t live');
select ok(not public.record_page_view('profile', 'no-such', repeat('e', 64), null), 'nor an unknown page');
select ok(not public.record_page_view('profile', 'pi-pia', 'short', null), 'nor a missing viewer');
select ok(not public.record_page_view('other', 'pi-pia', repeat('e', 64), null), 'nor another kind of page');
select ok(public.record_page_view('category', 'plumber', repeat('a', 64), null), 'a trade page view counts');
select ok(not public.record_page_view('category', 'plumber', repeat('f', 64), '00000000-0000-0000-0000-00000000b102'),
  'a trader looking at a trade page doesn''t');
select ok(not public.record_page_view('category', 'not-a-trade', repeat('f', 64), null), 'nor an unknown trade');
select is((select views from public.page_view_days where kind = 'profile' and ref = '00000000-0000-0000-0000-00000000b1b1'),
  2, 'two views of Pia''s page today');
-- Yesterday's viewer list is kept, the day before's is cleared on the next view.
insert into public.page_view_seen (kind, ref, day, viewer) values ('profile', 'x', private.london_today() - 3, repeat('z', 64));
select public.record_page_view('profile', 'pi-otto', repeat('a', 64), null);
select is((select count(*)::int from public.page_view_seen where day < private.london_today() - 1), 0,
  'viewer hashes older than a day are deleted');

-- ---------------------------------------------------------------- insights
insert into public.page_view_days (kind, ref, day, views) values
  ('profile', '00000000-0000-0000-0000-00000000b1b1', (date_trunc('month', private.london_today()) - interval '1 day')::date, 5),
  ('category', 'plumber', private.london_today() - 40, 100);
insert into public.questions (asker_id, category_id, district, body, status, published_at)
select '00000000-0000-0000-0000-00000000b103', id, d, 'Anyone know a good plumber near me?', 'published', now() - interval '2 days'
from public.categories, unnest(array['BL1', 'BL5']) d where slug = 'plumber';

select public.pi_as('00000000-0000-0000-0000-00000000b101');
set local role authenticated;
select is(public.my_insights('00000000-0000-0000-0000-00000000b1b1') #>> '{views,this_month}', '2', 'views this month');
select is(public.my_insights('00000000-0000-0000-0000-00000000b1b1') #>> '{views,last_month}', '5', 'and last month');
select is(jsonb_array_length(public.my_insights('00000000-0000-0000-0000-00000000b1b1') #> '{views,months}'), 6, 'six months');
select is(public.my_insights('00000000-0000-0000-0000-00000000b1b1') -> 'demand', 'null'::jsonb, 'no demand report without Pro');
select throws_ok($$select public.my_insights('00000000-0000-0000-0000-00000000b1b2')$$, 'P0001', 'not_your_listing',
  'not someone else''s insights');
reset role;

insert into public.subscriptions (provider_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, stripe_as_of)
values ('00000000-0000-0000-0000-00000000b1b1', 'cus_pi1', 'sub_pi1', 'monthly', 'active', now() + interval '20 days', now());
select public.pi_as('00000000-0000-0000-0000-00000000b101');
set local role authenticated;
select is(public.my_insights('00000000-0000-0000-0000-00000000b1b1') #> '{demand,trades}',
  '[{"slug": "plumber", "name": "Plumber", "page_views": 1, "questions": 1}]'::jsonb,
  'Pro: the trade page''s views in the last 30 days and questions in Pia''s areas');
reset role;

-- ---------------------------------------------------------------- quote follow-ups
insert into public.trade_docs (id, provider_id, kind, number, status, customer_name, customer_email, title, lines, total_pence, sent_at, until)
values
  ('00000000-0000-0000-0000-00000000b1d1', '00000000-0000-0000-0000-00000000b1b1', 'quote', 1, 'sent', 'Cal C', 'cal@example.com',
   'New tap', '[{"description":"Tap","quantity":1,"unit_pence":5000}]', 5000, now() - interval '4 days', null),
  ('00000000-0000-0000-0000-00000000b1d2', '00000000-0000-0000-0000-00000000b1b1', 'quote', 2, 'sent', 'Dee D', null,
   'New sink', '[{"description":"Sink","quantity":1,"unit_pence":5000}]', 5000, now() - interval '4 days', null),
  ('00000000-0000-0000-0000-00000000b1d3', '00000000-0000-0000-0000-00000000b1b1', 'quote', 3, 'accepted', 'Eve E', 'eve@example.com',
   'New bath', '[{"description":"Bath","quantity":1,"unit_pence":5000}]', 5000, now() - interval '4 days', null),
  ('00000000-0000-0000-0000-00000000b1d4', '00000000-0000-0000-0000-00000000b1b1', 'quote', 4, 'sent', 'Fay F', 'fay@example.com',
   'Old quote', '[{"description":"Bath","quantity":1,"unit_pence":5000}]', 5000, now() - interval '4 days', private.london_today() - 1),
  ('00000000-0000-0000-0000-00000000b1d5', '00000000-0000-0000-0000-00000000b1b2', 'quote', 1, 'sent', 'Gus G', 'gus@example.com',
   'Free plan', '[{"description":"Job","quantity":1,"unit_pence":5000}]', 5000, now() - interval '4 days', null);

select is(public.due_quote_followups(), '[{"id": "00000000-0000-0000-0000-00000000b1d1", "kind": "quote_followup_1"}]'::jsonb,
  'only the open, unanswered, emailed quote of a Pro listing is due');
select is(jsonb_array_length(public.claim_customer_message('quote_followup_1', '00000000-0000-0000-0000-00000000b1d1') -> 'send'),
  1, 'the follow-up is claimed, by email');
select is(public.due_quote_followups(), '[]'::jsonb, 'nothing more due until day 7');
update public.trade_docs set sent_at = now() - interval '8 days' where id = '00000000-0000-0000-0000-00000000b1d1';
select is(public.due_quote_followups(), '[{"id": "00000000-0000-0000-0000-00000000b1d1", "kind": "quote_followup_2"}]'::jsonb,
  'then the second');
update public.trade_docs set status = 'accepted' where id = '00000000-0000-0000-0000-00000000b1d1';
select is(public.claim_customer_message('quote_followup_2', '00000000-0000-0000-0000-00000000b1d1'), null,
  'an answered quote gets no follow-up');

select * from finish();
rollback;
