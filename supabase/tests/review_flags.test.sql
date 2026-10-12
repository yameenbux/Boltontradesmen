-- Auto-flag rules and reports (Plan 2, Task 7). Reviews are posted through submit_review under each
-- reviewer's JWT; created_at values are moved as postgres so each rule can be tested on its own
-- (inside one transaction now() is constant, so every new review would otherwise count as a burst).
begin;
select plan(29);

-- ---------------------------------------------------------------- fixture
-- Users 01-30: about 3 days old, 20 minutes apart (so no three were made together) unless a test changes it.
insert into auth.users (id, created_at)
select ('00000000-0000-0000-0000-0000000009' || lpad(n::text, 2, '0'))::uuid, now() - interval '3 days' - n * interval '20 minutes'
from generate_series(1, 30) n;
insert into public.profiles (user_id, role, display_name)
select ('00000000-0000-0000-0000-0000000009' || lpad(n::text, 2, '0'))::uuid, 'resident', 'Flag F.'
from generate_series(1, 30) n;

insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence)
select ('00000000-0000-0000-0000-000000000a' || lpad(n::text, 2, '0'))::uuid, 'rf-' || n, 'RF ' || n,
  '+4477009003' || lpad(n::text, 2, '0'), 'live', now(), '{}'::jsonb
from generate_series(1, 9) n;
insert into public.provider_categories (provider_id, category_id)
select p.id, c.id from public.providers p, public.categories c where p.slug like 'rf-%' and c.slug = 'caterer';

-- Post a caterer review of rf-<prov> as user c<usr> with the given quality and device hash; returns the review id.
create function public.rf_post(usr int, prov int, q int, dev text) returns uuid
language plpgsql as $$
declare
  v jsonb;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000009' || lpad(usr::text, 2, '0'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v := public.submit_review(jsonb_build_object(
    'provider_id', '00000000-0000-0000-0000-000000000a' || lpad(prov::text, 2, '0'),
    'category_id', (select id from public.categories where slug = 'caterer'),
    'job_month', to_char(date_trunc('month', now() at time zone 'Europe/London'), 'YYYY-MM-01'),
    'value_band', '<250', 'on_time', 'yes', 'on_price', 'yes', 'quality', q, 'tidy', null, 'use_again', 'yes'), dev);
  reset role;
  return (v ->> 'id')::uuid;
end;
$$;
create function public.rf_status(p uuid) returns text language sql as $$ select status::text from public.reviews where id = p $$;
create function public.rf_age(p uuid, i interval) returns void language sql as $$ update public.reviews set created_at = now() - i where id = p $$;
create temp table rv (k text primary key, id uuid);
grant select on rv to authenticated, anon;

-- ---------------------------------------------------------------- burst_48h (and its mirror image)
insert into rv values ('b1', public.rf_post(1, 1, 5, 'd1')), ('b2', public.rf_post(2, 1, 5, 'd2'));
select is(public.rf_status((select id from rv where k = 'b1')) || '/' || public.rf_status((select id from rv where k = 'b2')),
  'published/published', 'two reviews in 48 hours stay published');
insert into rv values ('b3', public.rf_post(3, 1, 5, 'd3'));
select is((select count(*)::int from public.reviews where provider_id = '00000000-0000-0000-0000-000000000a01' and status = 'under_check'),
  3, 'the third review in 48 hours puts all three under check');
select is((select count(*)::int from public.flags where rule = 'burst_48h' and source = 'auto'
           and target_id in (select id from rv where k in ('b1', 'b2', 'b3'))), 3, 'three burst_48h flags');

insert into rv values ('n1', public.rf_post(4, 2, 1, 'd4')), ('n2', public.rf_post(5, 2, 1, 'd5')), ('n3', public.rf_post(6, 2, 1, 'd6'));
select is((select count(*)::int from public.reviews where provider_id = '00000000-0000-0000-0000-000000000a02' and status = 'under_check'),
  3, 'three 1-star reviews in 48 hours are treated the same way');

-- reviews older than 48 hours do not count
insert into rv values ('o1', public.rf_post(7, 3, 4, 'd7'));
select public.rf_age((select id from rv where k = 'o1'), '3 days');
insert into rv values ('o2', public.rf_post(8, 3, 4, 'd8'));
select public.rf_age((select id from rv where k = 'o2'), '50 hours');
insert into rv values ('o3', public.rf_post(9, 3, 4, 'd9'));
select is(public.rf_status((select id from rv where k = 'o3')), 'published', 'older reviews are outside the 48-hour window');

-- admin clearance sticks: the cleared review is not flagged again for the same rule
update public.reviews set status = 'published' where id = (select id from rv where k = 'b1');
insert into rv values ('b4', public.rf_post(10, 1, 5, 'd10'));
select is(public.rf_status((select id from rv where k = 'b1')), 'published', 'a cleared review stays published after a further burst');
select is(public.rf_status((select id from rv where k = 'b4')), 'under_check', 'the new review in the burst is under check');

-- ---------------------------------------------------------------- accounts_created_together
update auth.users set created_at = now() - interval '5 days' where id = '00000000-0000-0000-0000-000000000911';
update auth.users set created_at = now() - interval '5 days' + interval '2 minutes' where id = '00000000-0000-0000-0000-000000000912';
update auth.users set created_at = now() - interval '5 days' + interval '9 minutes' where id = '00000000-0000-0000-0000-000000000913';
insert into rv values ('a1', public.rf_post(11, 4, 3, 'd11'));
select public.rf_age((select id from rv where k = 'a1'), '4 days');
insert into rv values ('a2', public.rf_post(12, 4, 3, 'd12'));
select public.rf_age((select id from rv where k = 'a2'), '3 days');
select is(public.rf_status((select id from rv where k = 'a2')), 'published', 'two accounts created together are not enough');
insert into rv values ('a3', public.rf_post(13, 4, 3, 'd13'));
select is((select count(*)::int from public.reviews where id in (select id from rv where k in ('a1', 'a2', 'a3')) and status = 'under_check'),
  3, 'three reviewers whose accounts were made within 10 minutes: all under check');
select is((select count(*)::int from public.flags where rule = 'accounts_created_together'
           and target_id in (select id from rv where k in ('a1', 'a2', 'a3'))), 3, 'three accounts_created_together flags');

update auth.users set created_at = now() - interval '5 days' where id = '00000000-0000-0000-0000-000000000914';
update auth.users set created_at = now() - interval '5 days' + interval '11 minutes' where id = '00000000-0000-0000-0000-000000000915';
update auth.users set created_at = now() - interval '5 days' + interval '22 minutes' where id = '00000000-0000-0000-0000-000000000916';
insert into rv values ('s1', public.rf_post(14, 5, 3, 'd14'));
select public.rf_age((select id from rv where k = 's1'), '4 days');
insert into rv values ('s2', public.rf_post(15, 5, 3, 'd15'));
select public.rf_age((select id from rv where k = 's2'), '3 days');
insert into rv values ('s3', public.rf_post(16, 5, 3, 'd16'));
select is((select count(*)::int from public.reviews where id in (select id from rv where k in ('s1', 's2', 's3')) and status = 'under_check'),
  0, 'accounts 11 minutes apart are not flagged');

-- ---------------------------------------------------------------- shared_device
insert into rv values ('h1', public.rf_post(17, 6, 4, 'same-device'));
select public.rf_age((select id from rv where k = 'h1'), '4 days');
insert into rv values ('h2', public.rf_post(18, 6, 4, 'other-device'));
select is(public.rf_status((select id from rv where k = 'h2')), 'published', 'different device hashes are fine');
select public.rf_age((select id from rv where k = 'h2'), '4 days');
insert into rv values ('h3', public.rf_post(19, 6, 4, 'same-device'));
select is(public.rf_status((select id from rv where k = 'h1')) || '/' || public.rf_status((select id from rv where k = 'h3')),
  'under_check/under_check', 'two reviewers on one device: both under check');
select is(public.rf_status((select id from rv where k = 'h2')), 'published', 'the other review is untouched');
select is((select count(*)::int from public.flags where rule = 'shared_device'), 2, 'two shared_device flags');

-- ---------------------------------------------------------------- lone_extreme_new_account
update auth.users set created_at = now() - interval '2 hours'
where id in ('00000000-0000-0000-0000-000000000920', '00000000-0000-0000-0000-000000000921',
             '00000000-0000-0000-0000-000000000922', '00000000-0000-0000-0000-000000000924');
insert into rv values ('e5', public.rf_post(20, 7, 5, 'd20'));
select public.rf_age((select id from rv where k = 'e5'), '4 days');
insert into rv values ('e1', public.rf_post(21, 7, 1, 'd21'));
select public.rf_age((select id from rv where k = 'e1'), '4 days');
insert into rv values ('e4', public.rf_post(22, 8, 4, 'd22'));
insert into rv values ('e5old', public.rf_post(23, 9, 5, 'd23'));
select is(public.rf_status((select id from rv where k = 'e5')), 'under_check', 'a 2-hour-old account''s first review at 5 stars: under check');
select is(public.rf_status((select id from rv where k = 'e1')), 'under_check', 'the same at 1 star');
select is(public.rf_status((select id from rv where k = 'e4')), 'published', 'the same at 4 stars stays published');
select is(public.rf_status((select id from rv where k = 'e5old')), 'published', '5 stars from a 3-day-old account stays published');
select is((select count(*)::int from public.flags where rule = 'lone_extreme_new_account'), 2, 'two lone_extreme_new_account flags');

-- edits re-run the rules
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000922","role":"authenticated"}', true);
select is(public.edit_review((select id from rv where k = 'e4'), jsonb_build_object(
    'category_id', (select id from public.categories where slug = 'caterer'),
    'job_month', to_char(date_trunc('month', now() at time zone 'Europe/London'), 'YYYY-MM-01'),
    'value_band', '<250', 'on_time', 'yes', 'on_price', 'yes', 'quality', 5, 'tidy', null, 'use_again', 'yes'), 'd22') ->> 'status',
  'under_check', 'editing a new account''s only review to 5 stars puts it under check');

-- ---------------------------------------------------------------- report_review
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000925","role":"authenticated"}', true);
select throws_ok(format($$select public.report_review(%L, '   ')$$, (select id from rv where k = 'o3')),
  'P0001', 'report_note_required', 'a blank report note: report_note_required');
select throws_ok(format($$select public.report_review(%L, %L)$$, (select id from rv where k = 'o3'), repeat('x', 501)),
  'P0001', 'report_note_required', 'a note over 500 characters: report_note_required');
select lives_ok(format($$select public.report_review(%L, 'This is my neighbour''s brother')$$, (select id from rv where k = 'o3')),
  'a member can report a review');
select throws_ok(format($$select public.report_review(%L, 'again')$$, (select id from rv where k = 'o3')),
  'P0001', 'already_reported', 'a second open report by the same person: already_reported');
select throws_ok($$select public.report_review('00000000-0000-0000-0000-00000000dead', 'x')$$,
  'P0001', 'review_not_found', 'an unknown review: review_not_found');
reset role;
select is((select count(*)::int from public.flags where rule = 'user_report' and source = 'user' and status = 'open'
           and target_id = (select id from rv where k = 'o3')
           and reporter_id = '00000000-0000-0000-0000-000000000925' and note = 'This is my neighbour''s brother'),
  1, 'one open user_report flag with the note');
select is(public.rf_status((select id from rv where k = 'o3')), 'published', 'a report never changes the review''s status');

set local role anon;
select throws_ok(format($$select public.report_review(%L, 'x')$$, (select id from rv where k = 'o3')), '42501', null,
  'anon cannot report');
reset role;

select * from finish();
rollback;
