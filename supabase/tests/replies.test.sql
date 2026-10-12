-- Provider replies (Plan 2, Task 12): provider_my_reviews and provider_reply. One reply per review, by the
-- provider linked to the listing, 1-400 characters, no phone numbers, editable for 14 days.
begin;
select plan(18);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000007a1'),  -- Owen, linked to the listing
  ('00000000-0000-0000-0000-0000000007a2'),  -- Rita, reviewer
  ('00000000-0000-0000-0000-0000000007a3'),  -- Nick, not linked
  ('00000000-0000-0000-0000-0000000007a4');  -- admin
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-0000000007a1', 'provider', 'Owen O.'),
  ('00000000-0000-0000-0000-0000000007a2', 'resident', 'Rita R.'),
  ('00000000-0000-0000-0000-0000000007a3', 'resident', 'Nick N.'),
  ('00000000-0000-0000-0000-0000000007a4', 'admin', null)
on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name;
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-0000000007b1', 'rp-plumb', 'RP Plumb', '+447700900351', 'live', now(), '{}'::jsonb,
   '00000000-0000-0000-0000-0000000007a1');
insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-0000000007b1', id from public.categories where slug = 'plumber';
insert into public.reviews (id, provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, tidy, use_again, comment)
values ('00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007a2',
  (select id from public.categories where slug = 'plumber'), date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 4, true, 'yes',
  'Quick and tidy');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000007a3","role":"authenticated"}';
select throws_ok($$select public.provider_reply('00000000-0000-0000-0000-0000000007c1', 'Thanks')$$,
  'P0001', 'not_your_listing', 'someone not linked to the listing: not_your_listing');
select is(jsonb_array_length(public.provider_my_reviews()), 0, 'no listings, no reviews');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}';
select throws_ok(format($$select public.provider_reply('00000000-0000-0000-0000-0000000007c1', %L)$$, repeat('a', 401)),
  'P0001', 'reply_too_long', '401 characters: reply_too_long');
select throws_ok($$select public.provider_reply('00000000-0000-0000-0000-0000000007c1', '   ')$$,
  'P0001', 'reply_empty', 'blank: reply_empty');
select throws_ok($$select public.provider_reply('00000000-0000-0000-0000-0000000007c1', 'Ring me on 07700 900 123')$$,
  'P0001', 'reply_has_phone', 'a phone number: reply_has_phone');
select is(public.provider_reply('00000000-0000-0000-0000-0000000007c1', '  Thanks Rita!  '), 'rp-plumb', 'reply posted, slug returned');
select is(public.provider_reply('00000000-0000-0000-0000-0000000007c1', 'Thanks Rita, glad it worked out.'), 'rp-plumb',
  'a second reply within 14 days edits it');
select is((public.provider_my_reviews() -> 0 -> 'provider' ->> 'slug'), 'rp-plumb', 'provider_my_reviews lists the listing');
select is((public.provider_my_reviews() -> 0 -> 'reviews' -> 0 ->> 'reviewer_name'), 'Rita R.', 'with the reviewer name');
select is((public.provider_my_reviews() -> 0 -> 'reviews' -> 0 -> 'reply' ->> 'body'), 'Thanks Rita, glad it worked out.',
  'and the current reply');
select ok((public.provider_my_reviews() -> 0 -> 'reviews' -> 0 -> 'reply') ? 'editable_until', 'with its edit window');
reset role;
select is((select count(*)::int from public.review_responses where review_id = '00000000-0000-0000-0000-0000000007c1'), 1, 'one reply per review');
select isnt((select edited_at from public.review_responses where review_id = '00000000-0000-0000-0000-0000000007c1'), null, 'edited_at set');
select is((select reply_body from public.review_public where id = '00000000-0000-0000-0000-0000000007c1'), 'Thanks Rita, glad it worked out.',
  'the reply is public');
update public.review_responses set created_at = now() - interval '15 days' where review_id = '00000000-0000-0000-0000-0000000007c1';
set local role authenticated;
select throws_ok($$select public.provider_reply('00000000-0000-0000-0000-0000000007c1', 'Late edit')$$,
  'P0001', 'edit_window_closed', 'after 14 days: edit_window_closed');

reset role;
create temp table reply_id as select id from public.review_responses where review_id = '00000000-0000-0000-0000-0000000007c1';
grant select on reply_id to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000007a4","role":"authenticated"}';
select is(public.admin_remove_reply((select id from reply_id), 'Abusive'), 'rp-plumb', 'admin removes the reply');
reset role;
select is((select reply_body from public.review_public where id = '00000000-0000-0000-0000-0000000007c1'), null,
  'after admin_remove_reply the reply is not public');
set local role anon;
select throws_ok($$select public.provider_reply('00000000-0000-0000-0000-0000000007c1', 'x')$$, '42501', null,
  'anon cannot reply');
reset role;

select * from finish();
rollback;
