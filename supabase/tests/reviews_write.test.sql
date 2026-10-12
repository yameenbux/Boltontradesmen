-- Review posting (Plan 2, Task 6): submit_review / edit_review rules, review_form_context, my_reviews,
-- and the new review_proofs / review_responses / flags tables staying closed to browsers.
begin;
select plan(52);

-- ---------------------------------------------------------------- fixture
insert into auth.users (id, created_at) values
  ('00000000-0000-0000-0000-0000000008a1', now() - interval '3 days'),   -- Amy
  ('00000000-0000-0000-0000-0000000008a2', now() - interval '3 days'),   -- Ben
  ('00000000-0000-0000-0000-0000000008a3', now() - interval '1 hour'),   -- Nia (new account)
  ('00000000-0000-0000-0000-0000000008a4', now() - interval '3 days'),   -- Lee (runs rw-own, a plumber)
  ('00000000-0000-0000-0000-0000000008a5', now() - interval '3 days'),   -- Xan (no profile)
  ('00000000-0000-0000-0000-0000000008a6', now() - interval '3 days'),   -- Kit (blocked)
  ('00000000-0000-0000-0000-0000000008a7', now() - interval '3 days'),   -- Rae (review removed by admin)
  ('00000000-0000-0000-0000-0000000008a8', now() - interval '3 days');   -- Dee (removed when they deleted an account)
insert into public.profiles (user_id, role, display_name, blocked_at) values
  ('00000000-0000-0000-0000-0000000008a1', 'resident', 'Amy A.', null),
  ('00000000-0000-0000-0000-0000000008a2', 'resident', 'Ben B.', null),
  ('00000000-0000-0000-0000-0000000008a3', 'resident', 'Nia N.', null),
  ('00000000-0000-0000-0000-0000000008a4', 'provider', 'Lee L.', null),
  ('00000000-0000-0000-0000-0000000008a6', 'resident', 'Kit K.', now()),
  ('00000000-0000-0000-0000-0000000008a7', 'resident', 'Rae R.', null),
  ('00000000-0000-0000-0000-0000000008a8', 'resident', 'Dee D.', null);

insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-0000000008b1', 'rw-plumb', 'RW Plumb', '+447700900321', 'live', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000008b2', 'rw-plumb2', 'RW Plumb Two', '+447700900322', 'live', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000008b3', 'rw-cater', 'RW Cater', '+447700900323', 'live', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000008b4', 'rw-paused', 'RW Paused', '+447700900324', 'paused', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000008b5', 'rw-own', 'RW Own', '+447700900325', 'live', now(), '{}'::jsonb,
    '00000000-0000-0000-0000-0000000008a4');
insert into public.provider_categories (provider_id, category_id)
select p.id, c.id from public.providers p, public.categories c
where (p.slug in ('rw-plumb', 'rw-plumb2', 'rw-paused', 'rw-own') and c.slug = 'plumber')
   or (p.slug = 'rw-cater' and c.slug = 'caterer');

insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, tidy, use_again, status, removal_reason)
select '00000000-0000-0000-0000-0000000008b1', u, (select id from public.categories where slug = 'plumber'),
  date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 3, true, 'yes', 'removed', reason
from (values ('00000000-0000-0000-0000-0000000008a7'::uuid, 'Fake: not a real customer'),
             ('00000000-0000-0000-0000-0000000008a8'::uuid, 'Reviewer deleted their account')) v(u, reason);

-- A review payload for (provider, category slug) with sensible answers, overridden by p_extra.
create function public.rw_p(p_provider uuid, p_cat text, p_extra jsonb default '{}') returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'provider_id', p_provider,
    'category_id', (select id from public.categories where slug = p_cat),
    'job_month', to_char(date_trunc('month', now() at time zone 'Europe/London'), 'YYYY-MM-01'),
    'value_band', '250-1k', 'on_time', 'yes', 'on_price', 'yes', 'quality', 4,
    'tidy', case when p_cat = 'plumber' then to_jsonb(true) else 'null'::jsonb end,
    'use_again', 'yes', 'comment', null
  ) || p_extra;
$$;
grant execute on function public.rw_p(uuid, text, jsonb) to authenticated, anon;

create temp table res (k text primary key, v jsonb);
grant all on res to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------- who may post
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a5","role":"authenticated"}';
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber'), 'h')$$,
  'P0001', 'not_member', 'no profile: not_member');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a6","role":"authenticated"}';
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber'), 'h')$$,
  'P0001', 'blocked', 'blocked account: blocked');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a1","role":"authenticated"}';
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b4', 'plumber'), 'h')$$,
  'P0001', 'provider_not_found', 'paused provider: provider_not_found');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008ff', 'plumber'), 'h')$$,
  'P0001', 'provider_not_found', 'unknown provider: provider_not_found');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a4","role":"authenticated"}';
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b5', 'plumber'), 'h')$$,
  'P0001', 'own_listing', 'own listing: own_listing');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber'), 'h')$$,
  'P0001', 'shares_category', 'a plumber reviewing another plumber: shares_category');
select is((public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b3', 'caterer'), 'h-lee')) ->> 'status',
  'published', 'a plumber may review a caterer');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a7","role":"authenticated"}';
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber'), 'h')$$,
  'P0001', 'removed_before', 'a review removed by the admin: removed_before');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a8","role":"authenticated"}';
select is((public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber'), 'h-dee')) ->> 'status',
  'published', 'a removal caused by deleting an account does not block a new review');

-- ---------------------------------------------------------------- field rules
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a1","role":"authenticated"}';
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'caterer', '{"tidy":null}'), 'h')$$,
  'P0001', 'bad_category', 'a category the provider is not listed in: bad_category');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber',
    jsonb_build_object('job_month', to_char(date_trunc('month', now() at time zone 'Europe/London') + interval '1 month', 'YYYY-MM-01'))), 'h')$$,
  'P0001', 'bad_job_month', 'next month: bad_job_month');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber',
    jsonb_build_object('job_month', to_char(date_trunc('month', now() at time zone 'Europe/London') - interval '37 months', 'YYYY-MM-01'))), 'h')$$,
  'P0001', 'bad_job_month', '37 months ago: bad_job_month');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber',
    jsonb_build_object('job_month', to_char(date_trunc('month', now() at time zone 'Europe/London'), 'YYYY-MM-15'))), 'h')$$,
  'P0001', 'bad_job_month', 'not the first of a month: bad_job_month');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber', '{"job_month":"soon"}'), 'h')$$,
  'P0001', 'bad_job_month', 'not a date: bad_job_month');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber', '{"tidy":null}'), 'h')$$,
  'P0001', 'tidy_required', 'plumber without tidy: tidy_required');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b3', 'caterer', '{"tidy":true}'), 'h')$$,
  'P0001', 'tidy_not_asked', 'caterer with tidy: tidy_not_asked');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber',
    jsonb_build_object('comment', repeat('a', 401))), 'h')$$,
  'P0001', 'comment_too_long', '401 characters: comment_too_long');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber', '{"comment":"ring him on 07700 900 123"}'), 'h')$$,
  'P0001', 'comment_has_phone', 'a spaced mobile number: comment_has_phone');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber', '{"comment":"+44 7700 900123"}'), 'h')$$,
  'P0001', 'comment_has_phone', 'an international number: comment_has_phone');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber', '{"comment":"0770090012 3"}'), 'h')$$,
  'P0001', 'comment_has_phone', 'a number split by a space: comment_has_phone');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber', '{"quality":6}'), 'h')$$,
  'P0001', 'bad_input', 'quality 6: bad_input');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber', '{"on_time":"sometimes"}'), 'h')$$,
  'P0001', 'bad_input', 'an unknown answer: bad_input');

-- ---------------------------------------------------------------- happy path and one review per provider
insert into res select 'amy1', public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber',
  '{"comment":"  Fitted 2 radiators for £350 in 2026  "}'), 'hash-amy');
select is((select v ->> 'status' from res where k = 'amy1'), 'published', 'a good review is published');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber'), 'h')$$,
  'P0001', 'already_reviewed', 'a second review of the same provider: already_reviewed');
insert into res select 'amy2', public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b3', 'caterer', '{"comment":"   "}'), 'hash-amy');
reset role;

select is((select device_hash from public.reviews where id = (select (v ->> 'id')::uuid from res where k = 'amy1')), 'hash-amy', 'device hash is stored');
select is((select comment from public.reviews where id = (select (v ->> 'id')::uuid from res where k = 'amy1')),
  'Fitted 2 radiators for £350 in 2026', 'comment is trimmed; prices and years are fine');
select is((select tidy from public.reviews where id = (select (v ->> 'id')::uuid from res where k = 'amy2')), null, 'caterer review has no tidy answer');
select is((select comment from public.reviews where id = (select (v ->> 'id')::uuid from res where k = 'amy2')), null, 'a blank comment is stored as null');
select is((select reviewer_id from public.reviews where id = (select (v ->> 'id')::uuid from res where k = 'amy1')),
  '00000000-0000-0000-0000-0000000008a1'::uuid, 'the reviewer is the caller');

-- ---------------------------------------------------------------- new accounts: one review in the first 24 hours
-- (earlier reviews of rw-plumb moved out of the 48-hour window so the burst rule stays out of this test)
update public.reviews set created_at = now() - interval '3 days'
where provider_id = '00000000-0000-0000-0000-0000000008b1' and status <> 'removed';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a3","role":"authenticated"}';
select is((public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber'), 'h-nia')) ->> 'status',
  'published', 'a new account may post one review');
select throws_ok($$select public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b2', 'plumber'), 'h')$$,
  'P0001', 'new_account_limit', 'a second review within 24 hours: new_account_limit');
reset role;
update auth.users set created_at = now() - interval '25 hours' where id = '00000000-0000-0000-0000-0000000008a3';
set local role authenticated;
select is((public.submit_review(public.rw_p('00000000-0000-0000-0000-0000000008b2', 'plumber'), 'h-nia')) ->> 'status',
  'published', 'allowed once the account is 25 hours old');

-- ---------------------------------------------------------------- edits
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a2","role":"authenticated"}';
select throws_ok(format($$select public.edit_review(%L, public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber'), 'h')$$,
    (select v ->> 'id' from res where k = 'amy1')),
  'P0001', 'not_your_review', 'someone else''s review: not_your_review');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a1","role":"authenticated"}';
reset role;
update public.reviews set created_at = now() - interval '13 days' where id = (select (v ->> 'id')::uuid from res where k = 'amy1');
set local role authenticated;
select is((public.edit_review((select (v ->> 'id')::uuid from res where k = 'amy1'),
    public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber', '{"quality":2,"comment":"Changed my mind"}'), 'h')) ->> 'status',
  'published', 'an edit on day 13 is allowed');
select throws_ok(format($$select public.edit_review(%L, public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber', '{"comment":"call 07700900123"}'), 'h')$$,
    (select v ->> 'id' from res where k = 'amy1')),
  'P0001', 'comment_has_phone', 'edits re-run the field checks');
reset role;
select is((select quality from public.reviews where id = (select (v ->> 'id')::uuid from res where k = 'amy1')), 2::smallint, 'the edit is stored');
select isnt((select edited_at from public.reviews where id = (select (v ->> 'id')::uuid from res where k = 'amy1')), null, 'edited_at is set');
update public.reviews set created_at = now() - interval '15 days' where id = (select (v ->> 'id')::uuid from res where k = 'amy1');
set local role authenticated;
select throws_ok(format($$select public.edit_review(%L, public.rw_p('00000000-0000-0000-0000-0000000008b1', 'plumber'), 'h')$$,
    (select v ->> 'id' from res where k = 'amy1')),
  'P0001', 'edit_window_closed', 'an edit on day 15: edit_window_closed');

-- ---------------------------------------------------------------- my_reviews and review_form_context
select is(jsonb_array_length(public.my_reviews()), 2, 'my_reviews lists the caller''s reviews');
select ok((select bool_and(r ? 'editable_until' and r ? 'provider_slug' and r ? 'business_name' and r ? 'removal_reason')
           from jsonb_array_elements(public.my_reviews()) r), 'my_reviews rows carry slug, name, removal reason and edit window');
select is((public.review_form_context('rw-plumb') -> 'existing' ->> 'id'), (select v ->> 'id' from res where k = 'amy1'),
  'review_form_context returns the existing review');
select is((public.review_form_context('rw-plumb') ->> 'blocked'), null, 'nothing blocks Amy');
select is((public.review_form_context('rw-plumb') -> 'categories' -> 0 ->> 'asks_tidy')::boolean, true, 'plumber asks about tidiness');
select is((public.review_form_context('rw-paused')), null, 'no context for a provider that is not live');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000008a4","role":"authenticated"}';
select is((public.review_form_context('rw-plumb') ->> 'blocked'), 'shares_category', 'context says why Lee cannot review');
select is((public.review_form_context('rw-own') ->> 'blocked'), 'own_listing', 'context: own listing');
reset role;

-- ---------------------------------------------------------------- privileges
set local role anon;
select throws_ok($$select public.submit_review('{}'::jsonb, 'h')$$, '42501', null, 'anon cannot call submit_review');
reset role;
set local role authenticated;
select throws_ok($$select count(*) from public.reviews$$, '42501', null, 'authenticated cannot read reviews directly');
select throws_ok($$insert into public.reviews (provider_id) values ('00000000-0000-0000-0000-0000000008b1')$$, '42501', null,
  'authenticated cannot insert reviews directly');
select throws_ok($$select count(*) from public.review_proofs$$, '42501', null, 'authenticated cannot read review_proofs');
select throws_ok($$select count(*) from public.review_responses$$, '42501', null, 'authenticated cannot read review_responses');
select throws_ok($$select count(*) from public.flags$$, '42501', null, 'authenticated cannot read flags');
reset role;

select * from finish();
rollback;
