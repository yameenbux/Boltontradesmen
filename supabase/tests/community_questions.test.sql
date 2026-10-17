-- Community questions (migration 000031): asking (held for email-only accounts, content rules, 3 a day, one open per
-- trade), answering (live providers in the trade, never your own listing, "I can help" only for your own, one per
-- account, closed after 14 days), the public views, reports, the admin's queue and removals, account deletion, and
-- that ranking never reads any of it. Accounts are made through the auth.users guard paths, as GoTrue would.
begin;
select plan(74);

update public.settings set value = '["cq-admin@example.com"]'::jsonb where key = 'admin_emails';

create function public.cq_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function public.cq_as(uuid) to authenticated;

create function pg_temp.email_user(p_id uuid, p_email text, p_name text) returns void language plpgsql as $$
begin
  insert into public.email_requests (email_norm, ip_hash, outcome, nonce_hash)
  values (private.normalise_email(p_email), 'pgtap-cq', 'approved', encode(sha256(convert_to('n-' || p_id::text, 'UTF8')), 'hex'));
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, created_at)
  values (p_id, p_email, jsonb_build_object('bv_nonce', 'n-' || p_id::text), '{"provider":"email"}', now() - interval '3 days');
  update auth.users set email_confirmed_at = now() - interval '3 days' where id = p_id;
  insert into public.profiles (user_id, role, display_name) values (p_id, 'resident', p_name);
end $$;
create function pg_temp.google_user(p_id uuid, p_email text, p_name text) returns void language plpgsql as $$
begin
  insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, created_at)
  values (p_id, p_email, now() - interval '3 days', '{"provider":"google"}', now() - interval '3 days');
  insert into auth.identities (provider_id, user_id, identity_data, provider)
  values ('sub-' || p_id::text, p_id, jsonb_build_object('sub', 'sub-' || p_id::text, 'email', p_email), 'google');
  insert into public.profiles (user_id, role, display_name) values (p_id, 'resident', p_name);
end $$;

create function pg_temp.cat(p_slug text) returns uuid language sql stable as $$
  select id from public.categories where slug = p_slug
$$;
create function pg_temp.ask(p_uid uuid, p_cat text, p_body text, p_district text default 'BL3') returns jsonb language sql as $$
  select public.submit_question(p_uid, pg_temp.cat(p_cat), p_district, p_body)
$$;
create function pg_temp.answer(p_uid uuid, p_q uuid, p_kind text, p_provider uuid, p_note text default null)
returns jsonb language sql as $$
  select public.submit_question_answer(p_uid, p_q, p_kind, p_provider, p_note)
$$;

-- Admin, residents (Gina and Gus on Google, Ellie email-only), and a trader (Tom, Google) linked to Spark One.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000c0a00', 'cq-admin@example.com');
insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-0000000c0a00', 'admin');
select pg_temp.google_user('00000000-0000-0000-0000-0000000c0001', 'gina.cq@example.org', 'Gina G.');
select pg_temp.google_user('00000000-0000-0000-0000-0000000c0002', 'gus.cq@example.org', 'Gus H.');
select pg_temp.email_user('00000000-0000-0000-0000-0000000c0003', 'ellie.cq@example.org', 'Ellie E.');
select pg_temp.google_user('00000000-0000-0000-0000-0000000c0004', 'tom.cq@example.org', 'Tom T.');
select pg_temp.google_user('00000000-0000-0000-0000-0000000c0005', 'dee.cq@example.org', 'Dee D.');

insert into public.providers (id, slug, business_name, phone_e164, whatsapp_e164, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-0000000c0b01', 'cq-spark-one', 'Spark One', '+447700900951', '+447700900951', 'live', now(), '{}'::jsonb,
   '00000000-0000-0000-0000-0000000c0004'),
  ('00000000-0000-0000-0000-0000000c0b02', 'cq-spark-two', 'Spark Two', '+447700900952', null, 'live', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000c0b03', 'cq-spark-paused', 'Spark Paused', '+447700900953', null, 'paused', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000c0b04', 'cq-pipe-one', 'Pipe One', '+447700900954', null, 'live', now(), '{}'::jsonb, null);
insert into public.provider_categories (provider_id, category_id)
select p.id, pg_temp.cat(case when p.slug like 'cq-spark-%' then 'electrician' else 'plumber' end)
from public.providers p where p.slug like 'cq-%';

create temp table k (name text primary key, id uuid);
grant all on k to authenticated;
create temp table stats_before as select id, review_count, score from public.provider_public where slug like 'cq-%';

-- ---------------------------------------------------------------- grants
select ok(not has_table_privilege('anon', 'public.questions', 'select')
          and not has_table_privilege('authenticated', 'public.question_answers', 'select')
          and not has_table_privilege('authenticated', 'public.question_reports', 'insert')
          and not has_table_privilege('service_role', 'public.questions', 'select'),
  'no direct table access for anon, authenticated or the service role');
select ok(has_table_privilege('anon', 'public.question_public', 'select')
          and has_table_privilege('anon', 'public.question_answer_public', 'select'),
  'the public reads the two views');
select ok(not has_function_privilege('authenticated', 'public.submit_question(uuid, uuid, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.submit_question_answer(uuid, uuid, text, uuid, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.report_question_content(uuid, text, uuid, text)', 'execute')
          and has_function_privilege('service_role', 'public.submit_question(uuid, uuid, text, text)', 'execute'),
  'posting, answering and reporting are for the app''s server only');
select ok(not has_function_privilege('anon', 'public.admin_list_question_queue()', 'execute'),
  'anon cannot call the admin queue');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
           where table_schema = 'public' and table_name = 'question_public'),
  array['id', 'category_slug', 'category_name', 'district', 'body', 'asker_name', 'created_at', 'closes_at', 'status',
        'recommendation_count', 'can_help_count'],
  'question_public exposes only safe fields (no account ids)');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public'
                      and table_name = 'question_answer_public' and column_name in ('author_id', 'phone_e164', 'whatsapp_e164')),
  'question_answer_public has no account id or phone number');

-- ---------------------------------------------------------------- asking
insert into k select 'q1', (pg_temp.ask('00000000-0000-0000-0000-0000000c0001', 'electrician', '  Anyone know a good
electrician in BL3?  ') ->> 'id')::uuid;
select is((select status || '|' || body from public.questions where id = (select id from k where name = 'q1')),
  'published|Anyone know a good electrician in BL3?', 'a Google account''s question publishes, tidied');
select is((select count(*)::int from public.question_public where id = (select id from k where name = 'q1') and status = 'open'
           and asker_name = 'Gina G.' and district = 'BL3' and category_slug = 'electrician'), 1,
  'and is public, open, with the shown name and district');
select is(pg_temp.ask('00000000-0000-0000-0000-0000000c0003', 'electrician', 'Need someone for a new socket please') ->> 'status',
  'pending', 'an email-only account''s question is held');
insert into k select 'held', id from public.questions where asker_id = '00000000-0000-0000-0000-0000000c0003';
select is((select count(*)::int from public.question_public where id = (select id from k where name = 'held')), 0,
  'a held question is not public');

select throws_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0002', 'plumber', 'Too short')$$,
  'P0001', 'body_too_short', 'under 10 characters is refused');
select throws_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0002', 'plumber', repeat('a', 281))$$,
  'P0001', 'body_too_long', 'over 280 characters is refused');
select throws_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0002', 'plumber', 'Ring me on 07700 900 123 please')$$,
  'P0001', 'body_has_phone', 'a phone number is refused');
select throws_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0002', 'plumber', 'See www.example.com for the job')$$,
  'P0001', 'body_has_link', 'a web address is refused');
select throws_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0002', 'plumber', 'Email me at gus@example.org thanks')$$,
  'P0001', 'body_has_link', 'an email address is refused');
select throws_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0002', 'plumber', 'Anyone know a plumber?', 'OTHER')$$,
  'P0001', 'bad_district', 'the district must be one of the listed ones');
select throws_ok($$select public.submit_question('00000000-0000-0000-0000-0000000c0002', gen_random_uuid(), 'BL1', 'Anyone know a plumber?')$$,
  'P0001', 'bad_category', 'the trade must exist');
select throws_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0a00', 'plumber', 'Anyone know a plumber?')$$,
  'P0001', 'not_member', 'the admin account (no profile name) cannot ask');
select throws_ok($$select pg_temp.ask(null, 'plumber', 'Anyone know a plumber?')$$,
  'P0001', 'not_member', 'nobody signed in cannot ask');

-- One open question per trade; three a day.
select throws_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0001', 'electrician', 'Another electrician question here')$$,
  'P0001', 'open_question_exists', 'one open question per account per trade');
select throws_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0003', 'electrician', 'Another electrician question here')$$,
  'P0001', 'open_question_exists', 'a held question counts as open');
select lives_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0001', 'plumber', 'Anyone know a plumber for a leak?')$$,
  'a second trade is fine');
select lives_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0001', 'joiner', 'Anyone know a joiner for doors?')$$,
  'a third question that day is fine');
select throws_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0001', 'roofer', 'Anyone know a roofer for tiles?')$$,
  'P0001', 'question_limit', 'a fourth in 24 hours is refused');
update public.questions set created_at = now() - interval '25 hours' where asker_id = '00000000-0000-0000-0000-0000000c0001';
select lives_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0001', 'roofer', 'Anyone know a roofer for tiles?')$$,
  'the limit is a rolling 24 hours');

-- ---------------------------------------------------------------- answering
select throws_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0002', %L, 'recommend', '00000000-0000-0000-0000-0000000c0b04')$$,
  (select id from k where name = 'q1')), 'P0001', 'bad_provider', 'the provider must be in the question''s trade');
select throws_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0002', %L, 'recommend', '00000000-0000-0000-0000-0000000c0b03')$$,
  (select id from k where name = 'q1')), 'P0001', 'bad_provider', 'and live');
select throws_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0002', %L, 'recommend', '00000000-0000-0000-0000-0000000c0b02', 'Call 07700 900 952')$$,
  (select id from k where name = 'q1')), 'P0001', 'note_has_phone', 'a phone number in the note is refused');
select throws_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0002', %L, 'recommend', '00000000-0000-0000-0000-0000000c0b02', repeat('b', 201))$$,
  (select id from k where name = 'q1')), 'P0001', 'note_too_long', 'a note over 200 characters is refused');
select throws_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0001', %L, 'recommend', '00000000-0000-0000-0000-0000000c0b02')$$,
  (select id from k where name = 'q1')), 'P0001', 'own_question', 'the asker cannot answer their own question');
select throws_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0002', %L, 'recommend', '00000000-0000-0000-0000-0000000c0b02')$$,
  (select id from k where name = 'held')), 'P0001', 'question_not_found', 'a held question takes no answers');

select lives_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0002', %L, 'recommend', '00000000-0000-0000-0000-0000000c0b02', ' Sorted my  fuse box. ')$$,
  (select id from k where name = 'q1')), 'a resident recommends a listed provider');
insert into k select 'gus', id from public.question_answers where author_id = '00000000-0000-0000-0000-0000000c0002';
select throws_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0002', %L, 'recommend', '00000000-0000-0000-0000-0000000c0b01')$$,
  (select id from k where name = 'q1')), 'P0001', 'already_answered', 'one answer per account per question');
select lives_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0003', %L, 'recommend', '00000000-0000-0000-0000-0000000c0b02')$$,
  (select id from k where name = 'q1')), 'an email-only account''s answer publishes (only questions are held)');

-- The trader: never their own listing as a recommendation; "I can help" only for their own.
select throws_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0004', %L, 'recommend', '00000000-0000-0000-0000-0000000c0b01')$$,
  (select id from k where name = 'q1')), 'P0001', 'own_listing', 'a trader cannot recommend their own business');
select throws_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0004', %L, 'can_help', '00000000-0000-0000-0000-0000000c0b02')$$,
  (select id from k where name = 'q1')), 'P0001', 'not_your_listing', '"I can help" only for their own listing');
select throws_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0005', %L, 'can_help', '00000000-0000-0000-0000-0000000c0b01')$$,
  (select id from k where name = 'q1')), 'P0001', 'not_your_listing', 'a resident cannot say "I can help" for a business');
select lives_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0004', %L, 'can_help', '00000000-0000-0000-0000-0000000c0b01', 'Free this week in BL3.')$$,
  (select id from k where name = 'q1')), 'the trader says they can help');

-- The public views.
select is((select recommendation_count || '/' || can_help_count from public.question_public where id = (select id from k where name = 'q1')),
  '2/1', 'two recommendations and one "I can help"');
select is((select string_agg(author_name || ':' || coalesce(note, '-'), ', ' order by author_name)
           from public.question_answer_public where question_id = (select id from k where name = 'q1') and kind = 'recommend'),
  'Ellie E.:-, Gus H.:Sorted my fuse box.', 'recommendations carry the shown name and the tidied note');
select is((select business_name || '|' || coalesce(author_name, 'none') || '|' || has_whatsapp::text from public.question_answer_public
           where question_id = (select id from k where name = 'q1') and kind = 'can_help'),
  'Spark One|none|true', '"I can help" is the business speaking, with no resident name');

-- A provider that stops being live drops out of the answers.
update public.providers set status = 'paused' where id = '00000000-0000-0000-0000-0000000c0b02';
select is((select recommendation_count from public.question_public where id = (select id from k where name = 'q1')), 0,
  'recommendations of a paused provider are hidden');
update public.providers set status = 'live' where id = '00000000-0000-0000-0000-0000000c0b02';

-- The answer page's context.
select is((public.question_answer_context('00000000-0000-0000-0000-0000000c0004', (select id from k where name = 'q1'))
           -> 'my_providers' -> 0 ->> 'slug'), 'cq-spark-one', 'the context lists the trader''s own listing in the trade');
select is(jsonb_array_length(public.question_answer_context('00000000-0000-0000-0000-0000000c0005', (select id from k where name = 'q1'))
           -> 'providers'), 2, '… and the trade''s live listings');
select is(public.question_answer_context('00000000-0000-0000-0000-0000000c0005', (select id from k where name = 'held')), null,
  'there is no context for a held question');

-- ---------------------------------------------------------------- closing after 14 days
update public.questions set published_at = now() - interval '15 days' where id = (select id from k where name = 'q1');
select is((select status from public.question_public where id = (select id from k where name = 'q1')), 'closed',
  'after 14 days the question reads as closed');
select throws_ok(format($$select pg_temp.answer('00000000-0000-0000-0000-0000000c0005', %L, 'recommend', '00000000-0000-0000-0000-0000000c0b02')$$,
  (select id from k where name = 'q1')), 'P0001', 'question_closed', 'and takes no new answers');
select lives_ok($$select pg_temp.ask('00000000-0000-0000-0000-0000000c0001', 'electrician', 'Still after an electrician in BL3')$$,
  'a closed question no longer blocks asking again in that trade');
update public.questions set published_at = now() where id = (select id from k where name = 'q1');

-- ---------------------------------------------------------------- ranking is untouched
select ok((select bool_and((p.review_count, p.score) is not distinct from (b.review_count, b.score))
           from public.provider_public p join stats_before b on b.id = p.id),
  'recommendations change no review count or score');
select ok(position('question' in pg_get_functiondef('private.provider_stats(uuid)'::regprocedure)) = 0,
  'provider_stats never reads questions');

-- ---------------------------------------------------------------- reports
select throws_ok(format($$select public.report_question_content('00000000-0000-0000-0000-0000000c0005', 'question', %L, '  ')$$,
  (select id from k where name = 'q1')), 'P0001', 'report_note_required', 'a report needs a note');
select throws_ok(format($$select public.report_question_content('00000000-0000-0000-0000-0000000c0005', 'question', %L, 'Spam')$$,
  (select id from k where name = 'held')), 'P0001', 'not_found', 'a held question cannot be reported');
select is(public.report_question_content('00000000-0000-0000-0000-0000000c0005', 'answer',
  (select id from k where name = 'gus'), 'Looks like an advert'),
  (select id from k where name = 'q1'), 'reporting an answer returns its question');
select throws_ok(format($$select public.report_question_content('00000000-0000-0000-0000-0000000c0005', 'answer', %L, 'Again')$$,
  (select id from k where name = 'gus')),
  'P0001', 'already_reported', 'one open report per person per item');
select lives_ok(format($$select public.report_question_content('00000000-0000-0000-0000-0000000c0002', 'question', %L, 'Rude')$$,
  (select id from k where name = 'q1')), 'a question can be reported');

-- ---------------------------------------------------------------- the admin
set local role authenticated;
select public.cq_as('00000000-0000-0000-0000-0000000c0002');
select throws_ok($$select public.admin_list_question_queue()$$, '42501', 'not admin', 'non-admins cannot see the queue');
select throws_ok(format($$select public.admin_approve_question(%L)$$, (select id from k where name = 'held')),
  '42501', 'not admin', 'non-admins cannot approve');
select public.cq_as('00000000-0000-0000-0000-0000000c0a00');
select is(jsonb_array_length(public.admin_list_question_queue() -> 'held'), 1, 'the admin sees the held question');
select is(public.admin_list_question_queue() -> 'held' -> 0 ->> 'sign_in_kind', 'email', '… with how its asker signs in');
select is(jsonb_array_length(public.admin_list_question_queue() -> 'reported'), 2, 'and the two reported items');
select is((public.admin_counts() ->> 'questions')::int, 3, 'admin_counts counts the questions queue');
select is(public.admin_approve_question((select id from k where name = 'held')), (select id from k where name = 'held'),
  'approving returns the question');
select throws_ok(format($$select public.admin_approve_question(%L)$$, (select id from k where name = 'held')),
  'P0001', 'question not pending', 'approving twice is refused');
select throws_ok(format($$select public.admin_remove_question_answer(%L, ' ')$$,
  (select id from k where name = 'gus')),
  '23514', null, 'removing an answer needs a reason');
select lives_ok(format($$select public.admin_remove_question_answer(%L, 'Advert')$$,
  (select id from k where name = 'gus')), 'the admin removes the answer');
select lives_ok(format($$select public.admin_dismiss_question_reports('question', %L, 'Fine')$$, (select id from k where name = 'q1')),
  'and dismisses the report on the question');
select is((public.admin_counts() ->> 'questions')::int, 0, 'nothing left waiting');
reset role;
select is((select status || '|' || published_at::date::text from public.questions where id = (select id from k where name = 'held')),
  'published|' || current_date::text, 'the approved question is published today (its 14 days start now)');
select is((select recommendation_count from public.question_public where id = (select id from k where name = 'q1')), 1,
  'a removed answer disappears publicly');
select is((select string_agg(action, ',' order by id) from public.audit_log
           where action in ('approve_question', 'remove_question_answer', 'dismiss_question_reports')),
  'approve_question,remove_question_answer,dismiss_question_reports', 'each admin action is in the audit log');
select is((select count(*)::int from public.question_reports where status = 'open'), 0, 'the answer''s report was resolved');

set local role authenticated;
select public.cq_as('00000000-0000-0000-0000-0000000c0a00');
select public.admin_remove_question((select id from k where name = 'held'), 'Off topic');
reset role;
select is((select count(*)::int from public.question_public where id = (select id from k where name = 'held')), 0,
  'a removed question disappears publicly');

-- ---------------------------------------------------------------- account deletion
set local role authenticated;
select public.cq_as('00000000-0000-0000-0000-0000000c0003');
select public.delete_my_account();
reset role;
select is((select count(*)::int from public.question_answers where author_id = '00000000-0000-0000-0000-0000000c0003'
           and status = 'removed' and removal_reason = 'Author deleted their account'), 1,
  'deleting an account takes its answers down');
select is((select recommendation_count from public.question_public where id = (select id from k where name = 'q1')), 0,
  'and they disappear publicly');

select * from finish();
rollback;
