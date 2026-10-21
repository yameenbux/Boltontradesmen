-- Plan 2b Task 8: reviews by email-only accounts are held (status 'pending': hidden, unscored) until the admin
-- approves (→ published, or under_check while an automatic flag is open) or removes them with a reason. Google
-- and phone accounts publish as before. An email-only account's edit of an approved review puts it back to
-- pending. Accounts are made through the auth.users guard paths, as GoTrue would.
begin;
select plan(27);

update public.settings set value = '["hr-admin@example.com"]'::jsonb where key = 'admin_emails';

create function public.hr_submit(p_uid uuid, p jsonb, h text) returns jsonb
language sql security definer set search_path = '' as $$ select public.submit_review(p_uid, p, h) $$;
create function public.hr_edit(p_uid uuid, p_id uuid, p jsonb, h text) returns jsonb
language sql security definer set search_path = '' as $$ select public.edit_review(p_uid, p_id, p, h) $$;
create function public.hr_p(p_provider uuid, p_quality int default 4) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'provider_id', p_provider, 'category_id', (select id from public.categories where slug = 'plumber'),
    'job_month', to_char(date_trunc('month', now() at time zone 'Europe/London'), 'YYYY-MM-01'),
    'value_band', '<250', 'on_time', 'yes', 'on_price', 'yes', 'quality', p_quality, 'tidy', true, 'use_again', 'yes',
    'comment', 'Held review test');
$$;
create function public.hr_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
grant execute on function public.hr_as(uuid) to authenticated;

create function pg_temp.email_user(p_id uuid, p_email text, p_name text, p_age interval default '3 days') returns void
language plpgsql as $$
begin
  insert into public.email_requests (email_norm, ip_hash, outcome, nonce_hash)
  values (private.normalise_email(p_email), 'pgtap-hr', 'approved', encode(sha256(convert_to('n-' || p_id::text, 'UTF8')), 'hex'));
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, created_at)
  values (p_id, p_email, jsonb_build_object('bv_nonce', 'n-' || p_id::text), '{"provider":"email"}', now() - p_age);
  update auth.users set email_confirmed_at = now() - p_age where id = p_id;
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
create function pg_temp.phone_user(p_id uuid, p_phone text, p_name text) returns void language plpgsql as $$
begin
  insert into public.otp_requests (phone_e164, ip_hash, outcome, nonce_hash)
  values ('+' || p_phone, 'pgtap', 'approved', encode(sha256(convert_to('n-' || p_id::text, 'UTF8')), 'hex'));
  insert into auth.users (id, phone, created_at, raw_user_meta_data)
  values (p_id, p_phone, now() - interval '3 days', jsonb_build_object('bv_nonce', 'n-' || p_id::text));
  update auth.users set phone_confirmed_at = now() where id = p_id;
  insert into public.profiles (user_id, role, display_name) values (p_id, 'resident', p_name);
end $$;

-- Admin (profile role admin) and three plumbers.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000e0a0', 'hr-admin@example.com');
insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-00000000e0a0', 'admin');
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence) values
  ('00000000-0000-0000-0000-00000000e0b1', 'hr-one', 'HR One', '+447700900901', 'live', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-00000000e0b2', 'hr-two', 'HR Two', '+447700900902', 'live', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-00000000e0b3', 'hr-three', 'HR Three', '+447700900903', 'live', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-00000000e0b4', 'hr-four', 'HR Four', '+447700900904', 'live', now(), '{}'::jsonb);
insert into public.provider_categories (provider_id, category_id)
select p.id, c.id from public.providers p, public.categories c where p.slug like 'hr-%' and c.slug = 'plumber';

select pg_temp.email_user('00000000-0000-0000-0000-00000000e001', 'ellie@example.org', 'Ellie E.');
select pg_temp.google_user('00000000-0000-0000-0000-00000000e002', 'gina@example.org', 'Gina G.');
select pg_temp.phone_user('00000000-0000-0000-0000-00000000e003', '447700900911', 'Phil P.');
select pg_temp.email_user('00000000-0000-0000-0000-00000000e004', 'later.google@example.org', 'Lara L.');

-- ---------------------------------------------------------------- held on posting
create temp table hr_before as select review_count, score from public.provider_public where slug = 'hr-one';
create temp table r (k text primary key, id uuid);
grant all on r to authenticated;
insert into r select 'ellie1', (public.hr_submit('00000000-0000-0000-0000-00000000e001', public.hr_p('00000000-0000-0000-0000-00000000e0b1'), 'd-ellie') ->> 'id')::uuid;
select is((select status::text from public.reviews where id = (select id from r where k = 'ellie1')), 'pending',
  'an email account''s review is held: pending');
select is(public.hr_submit('00000000-0000-0000-0000-00000000e004', public.hr_p('00000000-0000-0000-0000-00000000e0b2'), 'd-lara') ->> 'status',
  'pending', 'submit_review returns the pending status');
select is((select count(*)::int from public.review_public where id = (select id from r where k = 'ellie1')), 0,
  'a pending review is not public');
select ok((select (p.review_count, p.score) is not distinct from (b.review_count, b.score)
           from public.provider_public p, hr_before b where p.slug = 'hr-one'), 'and does not change the score or count');
select is(public.hr_submit('00000000-0000-0000-0000-00000000e002', public.hr_p('00000000-0000-0000-0000-00000000e0b2'), 'd-gina') ->> 'status',
  'published', 'a Google account''s review publishes');
select is(public.hr_submit('00000000-0000-0000-0000-00000000e003', public.hr_p('00000000-0000-0000-0000-00000000e0b3'), 'd-phil') ->> 'status',
  'published', 'a phone account''s review publishes');

-- An email account that later continues with Google: future reviews publish, the waiting one stays waiting.
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('sub-lara', '00000000-0000-0000-0000-00000000e004', '{"sub":"sub-lara","email":"later.google@example.org"}', 'google');
select is(public.hr_submit('00000000-0000-0000-0000-00000000e004', public.hr_p('00000000-0000-0000-0000-00000000e0b3'), 'd-lara2') ->> 'status',
  'published', 'an email account that gains a Google identity publishes its next review');
select is((select status::text from public.reviews where reviewer_id = '00000000-0000-0000-0000-00000000e004'
           and provider_id = '00000000-0000-0000-0000-00000000e0b2'), 'pending', '… and its earlier one stays pending');

-- ---------------------------------------------------------------- the admin queue
-- Lara's held review is the older one.
update public.reviews set created_at = now() - interval '1 hour'
where reviewer_id = '00000000-0000-0000-0000-00000000e004' and status = 'pending';
set local role authenticated;
select public.hr_as('00000000-0000-0000-0000-00000000e002');
select throws_ok($$select public.admin_list_reviews_pending()$$, '42501', 'not admin', 'non-admins cannot list pending reviews');
select public.hr_as('00000000-0000-0000-0000-00000000e0a0');
select is(jsonb_array_length(public.admin_list_reviews_pending()), 2, 'the admin sees both pending reviews');
select is(public.admin_list_reviews_pending() -> 0 ->> 'reviewer_name', 'Lara L.', 'oldest first');
select is((select x ->> 'sign_in_kind' from jsonb_array_elements(public.admin_list_reviews_pending()) x
           where x ->> 'id' = (select id::text from r where k = 'ellie1')), 'email', 'with how the reviewer signs in');
select is((select x ->> 'comment' from jsonb_array_elements(public.admin_list_reviews_pending()) x
           where x ->> 'id' = (select id::text from r where k = 'ellie1')), 'Held review test', 'and the review itself');
select is((public.admin_counts() ->> 'pending')::int, 2, 'admin_counts counts them');

-- ---------------------------------------------------------------- Review Focus 4
-- Approve with no open automatic flag → published, audit approve_review.
select is(public.admin_set_review_status((select id from r where k = 'ellie1'), 'published', null), 'hr-one', 'approve returns the slug');
reset role;
select is((select status::text from public.reviews where id = (select id from r where k = 'ellie1')), 'published', 'approved → published');
select is((select count(*)::int from public.audit_log where action = 'approve_review' and target_id = (select id::text from r where k = 'ellie1')),
  1, 'one approve_review audit row');
select is((select count(*)::int from public.review_public where id = (select id from r where k = 'ellie1')), 1, 'now public');

-- The email account edits its approved review → pending again.
select is(public.hr_edit('00000000-0000-0000-0000-00000000e001', (select id from r where k = 'ellie1'),
  public.hr_p('00000000-0000-0000-0000-00000000e0b1', 3), 'd-ellie') ->> 'status', 'pending',
  'an email account editing its approved review puts it back to pending');

-- A pending review that tripped burst_48h → approve → under_check (the flag stays open for the admin).
-- HR Four already has two reviews today, so a third within 48 hours trips burst_48h.
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000e0c1'), ('00000000-0000-0000-0000-00000000e0c2');
insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, tidy, use_again)
select '00000000-0000-0000-0000-00000000e0b4', u, (select id from public.categories where slug = 'plumber'),
  date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 4, true, 'yes'
from unnest(array['00000000-0000-0000-0000-00000000e0c1', '00000000-0000-0000-0000-00000000e0c2']::uuid[]) u;
select pg_temp.email_user('00000000-0000-0000-0000-00000000e005', 'burst@example.org', 'Bo B.', '5 days');
insert into r select 'burst', (public.hr_submit('00000000-0000-0000-0000-00000000e005', public.hr_p('00000000-0000-0000-0000-00000000e0b4'), 'd-bo') ->> 'id')::uuid;
select ok(exists (select 1 from public.flags where target_id = (select id from r where k = 'burst') and rule = 'burst_48h' and status = 'open'),
  'automatic flags are recorded on a held review');
select is((select status::text from public.reviews where id = (select id from r where k = 'burst')), 'pending', '… which stays pending');
set local role authenticated;
select public.hr_as('00000000-0000-0000-0000-00000000e0a0');
select public.admin_set_review_status((select id from r where k = 'burst'), 'published', null);
reset role;
select is((select status::text from public.reviews where id = (select id from r where k = 'burst')), 'under_check',
  'approving a held review with an open automatic flag makes it under_check, not published');

-- Remove: a reason is required; then removed + remove_review audit row.
set local role authenticated;
select public.hr_as('00000000-0000-0000-0000-00000000e0a0');
select throws_ok($$select public.admin_set_review_status((select id from r where k = 'ellie1'), 'removed', '  ')$$,
  '23514', null, 'removing a pending review needs a reason');
select throws_ok($$select public.admin_set_review_status((select id from r where k = 'ellie1'), 'under_check', 'x')$$,
  'P0001', 'transition not allowed', 'pending → under_check directly is not allowed');
select public.admin_set_review_status((select id from r where k = 'ellie1'), 'removed', 'Spam');
reset role;
select is((select status::text || '/' || removal_reason from public.reviews where id = (select id from r where k = 'ellie1')),
  'removed/Spam', 'removed with the reason');
select is((select count(*)::int from public.audit_log where action = 'remove_review' and target_id = (select id::text from r where k = 'ellie1')),
  1, 'one remove_review audit row');
select is((select count(*)::int from public.flags where target_id = (select id from r where k = 'ellie1') and status = 'open'), 0,
  'the removed review''s open flags are resolved');

select * from finish();
rollback;
