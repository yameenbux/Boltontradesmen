-- Admin moderation (Plan 2, Task 11): reviews under check, flags, proofs, replies. Every function refuses
-- non-admins; every write leaves one audit_log row; removal needs a reason and is final.
begin;
select plan(46);

-- ---------------------------------------------------------------- fixture
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000009a1'),  -- admin
  ('00000000-0000-0000-0000-0000000009a2'),  -- reviewer Pia
  ('00000000-0000-0000-0000-0000000009a3'),  -- reporter Rob
  ('00000000-0000-0000-0000-0000000009a4'),  -- reviewer Tom
  ('00000000-0000-0000-0000-0000000009a5');  -- provider owner
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-0000000009a1', 'admin', null),
  ('00000000-0000-0000-0000-0000000009a2', 'resident', 'Pia P.'),
  ('00000000-0000-0000-0000-0000000009a3', 'resident', 'Rob R.'),
  ('00000000-0000-0000-0000-0000000009a4', 'resident', 'Tom T.'),
  ('00000000-0000-0000-0000-0000000009a5', 'provider', 'Owen O.')
on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name;

insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-0000000009b1', 'mod-plumb', 'Mod Plumb', '+447700900341', 'live', now(), '{}'::jsonb,
   '00000000-0000-0000-0000-0000000009a5');
insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-0000000009b1', id from public.categories where slug = 'plumber';

insert into public.reviews (id, provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, tidy, use_again, status, comment)
select v.id, '00000000-0000-0000-0000-0000000009b1', v.reviewer, (select id from public.categories where slug = 'plumber'),
  date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 4, true, 'yes', v.status::public.review_status, v.comment
from (values
  ('00000000-0000-0000-0000-0000000009c1'::uuid, '00000000-0000-0000-0000-0000000009a2'::uuid, 'under_check', 'Flagged one'),
  ('00000000-0000-0000-0000-0000000009c2'::uuid, '00000000-0000-0000-0000-0000000009a3'::uuid, 'published', 'Plain one'),
  ('00000000-0000-0000-0000-0000000009c3'::uuid, '00000000-0000-0000-0000-0000000009a4'::uuid, 'published', 'With proof')
) v(id, reviewer, status, comment);

insert into public.flags (id, target_type, target_id, source, rule, note, reporter_id) values
  ('00000000-0000-0000-0000-0000000009f1', 'review', '00000000-0000-0000-0000-0000000009c1', 'auto', 'burst_48h', null, null),
  ('00000000-0000-0000-0000-0000000009f2', 'review', '00000000-0000-0000-0000-0000000009c1', 'user', 'user_report',
   'This is the owner''s cousin', '00000000-0000-0000-0000-0000000009a3');
insert into public.review_proofs (id, review_id, storage_path, mime_type) values
  ('00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-0000000009c3', '00000000-0000-0000-0000-0000000009c3/p.jpg', 'image/jpeg');
insert into public.review_responses (id, review_id, provider_id, author_id, body) values
  ('00000000-0000-0000-0000-0000000009e1', '00000000-0000-0000-0000-0000000009c2', '00000000-0000-0000-0000-0000000009b1',
   '00000000-0000-0000-0000-0000000009a5', 'Thanks Rob');

create temp table out (k text primary key, v jsonb);
grant all on out to authenticated;
set local role authenticated;

-- ---------------------------------------------------------------- not admin
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000009a2","role":"authenticated"}';
select throws_ok($$select public.admin_counts()$$, '42501', 'not admin', 'resident: admin_counts');
select throws_ok($$select public.admin_list_reviews_under_check()$$, '42501', 'not admin', 'resident: list under check');
select throws_ok($$select public.admin_list_open_flags()$$, '42501', 'not admin', 'resident: list flags');
select throws_ok($$select public.admin_list_pending_proofs()$$, '42501', 'not admin', 'resident: list proofs');
select throws_ok($$select public.admin_proof_path('00000000-0000-0000-0000-0000000009d1')$$, '42501', 'not admin', 'resident: proof path');
select throws_ok($$select public.admin_set_review_status('00000000-0000-0000-0000-0000000009c1', 'removed', 'x')$$, '42501', 'not admin',
  'resident: set review status');
select throws_ok($$select public.admin_resolve_flag('00000000-0000-0000-0000-0000000009f2', 'dismissed', null)$$, '42501', 'not admin',
  'resident: resolve flag');
select throws_ok($$select public.admin_check_proof('00000000-0000-0000-0000-0000000009d1', 'accepted', null)$$, '42501', 'not admin',
  'resident: check proof');
select throws_ok($$select public.admin_remove_reply('00000000-0000-0000-0000-0000000009e1', 'x')$$, '42501', 'not admin',
  'resident: remove reply');

-- ---------------------------------------------------------------- reads
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}';
select is(public.admin_counts(), '{"pending":0,"under_check":1,"open_flags":2,"pending_proofs":1}'::jsonb, 'counts');
insert into out select 'uc', public.admin_list_reviews_under_check();
select is(jsonb_array_length((select v from out where k = 'uc')), 1, 'one review under check');
select is((select v -> 0 ->> 'provider_slug' from out where k = 'uc'), 'mod-plumb', 'with the provider slug');
select is((select v -> 0 ->> 'reviewer_name' from out where k = 'uc'), 'Pia P.', 'with the reviewer name');
select ok((select v -> 0 ? 'account_created_at' from out where k = 'uc'), 'with the account age');
select is((select v -> 0 -> 'flags' -> 0 ->> 'rule' from out where k = 'uc'), 'burst_48h', 'with its open flags');
insert into out select 'fl', public.admin_list_open_flags();
select is(jsonb_array_length((select v from out where k = 'fl')), 2, 'two open flags');
select is((select f ->> 'reporter_name' from out, jsonb_array_elements(v) f where k = 'fl' and f ->> 'rule' = 'user_report'),
  'Rob R.', 'a report shows who sent it');
select is((select f ->> 'note' from out, jsonb_array_elements(v) f where k = 'fl' and f ->> 'rule' = 'user_report'),
  'This is the owner''s cousin', 'and their note');
select is(jsonb_array_length(public.admin_list_pending_proofs()), 1, 'one proof to check');
select is(public.admin_proof_path('00000000-0000-0000-0000-0000000009d1'), '00000000-0000-0000-0000-0000000009c3/p.jpg', 'proof path');

-- ---------------------------------------------------------------- clear, check, remove
select is(public.admin_set_review_status('00000000-0000-0000-0000-0000000009c1', 'published', null), 'mod-plumb',
  'clearing returns the provider slug');
reset role;
select is((select status::text from public.reviews where id = '00000000-0000-0000-0000-0000000009c1'), 'published', 'cleared');
select is((select status from public.flags where id = '00000000-0000-0000-0000-0000000009f1'), 'resolved', 'auto flag resolved');
select is((select status from public.flags where id = '00000000-0000-0000-0000-0000000009f2'), 'open', 'a user report stays open');
select is((select count(*)::int from public.audit_log where action = 'clear_review'), 1, 'audit clear_review');
set local role authenticated;
select throws_ok($$select public.admin_set_review_status('00000000-0000-0000-0000-0000000009c1', 'under_check', '  ')$$,
  '23514', null, 'putting under check needs a reason');
select is(public.admin_set_review_status('00000000-0000-0000-0000-0000000009c1', 'under_check', 'Report looks credible'), 'mod-plumb',
  'published -> under_check with a reason');
select throws_ok($$select public.admin_set_review_status('00000000-0000-0000-0000-0000000009c1', 'removed', '')$$,
  '23514', null, 'removal needs a reason');
select is(public.admin_set_review_status('00000000-0000-0000-0000-0000000009c1', 'removed', 'Fake: same household as the provider'),
  'mod-plumb', 'removed with a reason');
reset role;
select is((select removal_reason from public.reviews where id = '00000000-0000-0000-0000-0000000009c1'),
  'Fake: same household as the provider', 'the reason is stored');
select is((select count(*)::int from public.audit_log where action = 'remove_review' and reason = 'Fake: same household as the provider'),
  1, 'one audit row remove_review with the reason');
select is((select count(*)::int from public.audit_log where action = 'check_review'), 1, 'audit check_review');
select is((select count(*)::int from public.flags where target_id = '00000000-0000-0000-0000-0000000009c1' and status = 'open'), 0,
  'removing resolves every open flag on the review');
select is((select count(*)::int from public.review_public where id = '00000000-0000-0000-0000-0000000009c1'), 0,
  'a removed review is gone from review_public');
set local role authenticated;
select throws_ok($$select public.admin_set_review_status('00000000-0000-0000-0000-0000000009c1', 'published', null)$$,
  'P0001', 'transition not allowed', 'removal is final');
select throws_ok($$select public.admin_set_review_status('00000000-0000-0000-0000-0000000009c2', 'under_notice', 'x')$$,
  'P0001', 'transition not allowed', 'under_notice is not an admin choice here');

-- ---------------------------------------------------------------- proofs
select is(public.admin_check_proof('00000000-0000-0000-0000-0000000009d1', 'accepted', null), 'mod-plumb', 'proof accepted');
select is((select verified_job from public.review_public where id = '00000000-0000-0000-0000-0000000009c3'), true,
  'the review shows Verified job');
select is((select verified_job_count from public.provider_public where slug = 'mod-plumb'), 1, 'the provider counts it');
select throws_ok($$select public.admin_check_proof('00000000-0000-0000-0000-0000000009d1', 'accepted', null)$$,
  'P0001', 'proof already checked', 'a proof is checked once');

-- ---------------------------------------------------------------- flags and replies
reset role;
insert into public.flags (id, target_type, target_id, source, rule, note, reporter_id) values
  ('00000000-0000-0000-0000-0000000009f3', 'review', '00000000-0000-0000-0000-0000000009c2', 'user', 'user_report', 'Rude', '00000000-0000-0000-0000-0000000009a4');
set local role authenticated;
select lives_ok($$select public.admin_resolve_flag('00000000-0000-0000-0000-0000000009f3', 'dismissed', 'Fair comment')$$, 'dismiss a report');
select throws_ok($$select public.admin_resolve_flag('00000000-0000-0000-0000-0000000009f3', 'resolved', null)$$,
  'P0001', 'flag not open', 'a flag is closed once');
select throws_ok($$select public.admin_remove_reply('00000000-0000-0000-0000-0000000009e1', ' ')$$, '23514', null,
  'removing a reply needs a reason');
select is(public.admin_remove_reply('00000000-0000-0000-0000-0000000009e1', 'Shares the reviewer''s address'), 'mod-plumb',
  'reply removed');
reset role;
select is((select reply_body from public.review_public where id = '00000000-0000-0000-0000-0000000009c2'), null,
  'a removed reply is not public');
select is((select array_agg(action order by action) from public.audit_log where action in ('check_proof', 'resolve_flag', 'remove_reply')),
  array['check_proof', 'remove_reply', 'resolve_flag'], 'one audit row each for proof, flag and reply');

select * from finish();
rollback;
