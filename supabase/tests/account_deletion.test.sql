-- Account deletion (Plan 2, Task 13): delete_my_account takes the person's reviews and replies down, unlinks
-- their listings, marks the profile deleted and keeps the phone number privately in phone_retention for
-- 12 months. my_reviews also reports each review's proof state for the account page.
begin;
select plan(26);

insert into public.otp_requests (phone_e164, ip_hash, outcome, nonce_hash)
values ('+447700900481', 'pgtap', 'approved', encode(sha256(convert_to('del-nonce', 'UTF8')), 'hex'));
insert into auth.users (id, phone, created_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000009a1', '447700900481', now() - interval '3 days', '{"bv_nonce":"del-nonce"}');   -- Della, deletes
insert into auth.users (id, created_at) values
  ('00000000-0000-0000-0000-0000000009a2', now() - interval '3 days');                   -- Ravi, stays
insert into public.profiles (user_id, role, display_name, postcode_district) values
  ('00000000-0000-0000-0000-0000000009a1', 'provider', 'Della D.', 'BL3'),
  ('00000000-0000-0000-0000-0000000009a2', 'resident', 'Ravi R.', 'BL1');
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-0000000009b1', 'ad-plumb', 'AD Plumb', '+447700900371', 'live', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000009b2', 'ad-della', 'Della Decor', '+447700900481', 'live', now(), '{}'::jsonb,
    '00000000-0000-0000-0000-0000000009a1');
insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-0000000009b1'::uuid, id from public.categories where slug = 'plumber'
union all
select '00000000-0000-0000-0000-0000000009b2', id from public.categories where slug = 'painter-decorator';
insert into public.reviews (id, provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, tidy, use_again, comment) values
  ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009a1',
   (select id from public.categories where slug = 'plumber'), date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 4, true, 'yes', 'Good job'),
  ('00000000-0000-0000-0000-0000000009c2', '00000000-0000-0000-0000-0000000009b2', '00000000-0000-0000-0000-0000000009a2',
   (select id from public.categories where slug = 'painter-decorator'), date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 4, true, 'yes', 'Neat');
insert into public.review_responses (review_id, provider_id, author_id, body) values
  ('00000000-0000-0000-0000-0000000009c2', '00000000-0000-0000-0000-0000000009b2', '00000000-0000-0000-0000-0000000009a1', 'Thanks Ravi');
insert into public.review_proofs (review_id, storage_path, mime_type) values
  ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009c1/a.jpg', 'image/jpeg');
-- someone else's retention row, past its purge date
insert into public.phone_retention (user_id, phone_e164, deleted_at, purge_after)
values ('00000000-0000-0000-0000-0000000009a2', '+447700900499', now() - interval '13 months', now() - interval '1 month');

-- ---------------------------------------------------------------- my_reviews proof state
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}';
select is(public.my_reviews() -> 0 ->> 'proof', 'pending', 'my_reviews: a pending proof shows as pending');
select is(public.my_reviews() -> 0 ->> 'business_name', 'AD Plumb', 'my_reviews: names the provider');
reset role;
update public.review_proofs set outcome = 'accepted' where review_id = '00000000-0000-0000-0000-0000000009c1';
set local role authenticated;
select is(public.my_reviews() -> 0 ->> 'proof', 'accepted', 'my_reviews: an accepted proof');
reset role;
update public.review_proofs set outcome = 'rejected' where review_id = '00000000-0000-0000-0000-0000000009c1';
set local role authenticated;
select is(public.my_reviews() -> 0 ->> 'proof', 'rejected', 'my_reviews: a rejected proof');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000009a2","role":"authenticated"}';
select is(public.my_reviews() -> 0 -> 'proof', 'null'::jsonb, 'my_reviews: no proof is null');

-- ---------------------------------------------------------------- delete_my_account
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}';
select set_eq($$select unnest(public.delete_my_account())$$, array['ad-plumb', 'ad-della'],
  'returns the slugs of the providers whose pages change');
reset role;
select is((select status::text from public.reviews where id = '00000000-0000-0000-0000-0000000009c1'), 'removed', 'their review is removed');
select is((select removal_reason from public.reviews where id = '00000000-0000-0000-0000-0000000009c1'), 'Reviewer deleted their account',
  'with the account-deletion reason');
select is((select count(*)::int from public.review_public where id = '00000000-0000-0000-0000-0000000009c1'), 0, 'gone from review_public');
select is((select status from public.review_responses where review_id = '00000000-0000-0000-0000-0000000009c2'), 'removed', 'their reply is removed');
select is((select removal_reason from public.review_responses where review_id = '00000000-0000-0000-0000-0000000009c2'),
  'Reviewer deleted their account', 'with the same reason');
select is((select reply_body from public.review_public where id = '00000000-0000-0000-0000-0000000009c2'), null, 'the reply is not public');
select is((select user_id from public.providers where id = '00000000-0000-0000-0000-0000000009b2'), null, 'their listing is unlinked');
select is((select status::text from public.providers where id = '00000000-0000-0000-0000-0000000009b2'), 'live', 'and stays live');
select isnt((select deleted_at from public.profiles where user_id = '00000000-0000-0000-0000-0000000009a1'), null, 'profile marked deleted');
select is((select display_name from public.profiles where user_id = '00000000-0000-0000-0000-0000000009a1'), null, 'display name cleared');
select is((select count(*)::int from public.phone_retention where user_id = '00000000-0000-0000-0000-0000000009a1'), 1, 'one retention row');
select is((select phone_e164 from public.phone_retention where user_id = '00000000-0000-0000-0000-0000000009a1'), '+447700900481',
  'holding the number in E.164');
select ok((select purge_after between now() + interval '12 months' - interval '1 minute' and now() + interval '12 months' + interval '1 minute'
  from public.phone_retention where user_id = '00000000-0000-0000-0000-0000000009a1'), 'kept for 12 months');
select is((select count(*)::int from public.phone_retention where phone_e164 = '+447700900499'), 0, 'expired retention rows are purged');
select is((select count(*)::int from public.audit_log where action = 'delete_account' and actor_id = '00000000-0000-0000-0000-0000000009a1'), 1,
  'one audit_log row');

set local role authenticated;
select lives_ok($$select public.delete_my_account()$$, 'calling it again is safe');
reset role;
select is((select count(*)::int from public.phone_retention where user_id = '00000000-0000-0000-0000-0000000009a1'), 1,
  'and adds no second retention row');

set local role authenticated;
select throws_ok($$select public.submit_review(jsonb_build_object(
    'provider_id', '00000000-0000-0000-0000-0000000009b1', 'category_id', (select id from public.categories where slug = 'plumber'),
    'job_month', to_char(date_trunc('month', now() at time zone 'Europe/London'), 'YYYY-MM-01'),
    'value_band', '<250', 'on_time', 'yes', 'on_price', 'yes', 'quality', 3, 'tidy', true, 'use_again', 'yes'), 'h')$$,
  'P0001', 'not_member', 'a deleted account cannot post: not_member');
select throws_ok($$select * from public.phone_retention$$, '42501', null, 'authenticated cannot read phone_retention');
reset role;
set local role service_role;
select throws_ok($$select * from public.phone_retention$$, '42501', null, 'service_role cannot read phone_retention');
reset role;
select * from finish();
rollback;
