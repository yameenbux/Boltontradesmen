-- Final review 2 minors:
--   M1  only accounts that signed in with a confirmed mobile may review, report or reply (not the email admin,
--       not an anonymous Supabase session, not a phone account whose number was never confirmed);
--       Plan 2b: an email-code account (confirmed by its code) may now review too; the admin still may not;
--   M4  phone_retention rows past purge_after are purged regularly (on every code check), not only when
--       someone deletes an account;
--   M8  the admin account can't be deleted from the account page (it would lock the only admin out);
--   M14 one person can file at most 10 reports a day.
begin;
select plan(14);

create function public.t_submit_review(p jsonb, h text) returns jsonb
language sql security definer set search_path = '' as $$ select public.submit_review(auth.uid(), p, h) $$;
grant execute on function public.t_submit_review(jsonb, text) to authenticated;
create function public.mn_p() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'provider_id', '00000000-0000-0000-0000-00000000cb01', 'category_id', (select id from public.categories where slug = 'plumber'),
    'job_month', to_char(date_trunc('month', now() at time zone 'Europe/London'), 'YYYY-MM-01'),
    'value_band', '<250', 'on_time', 'yes', 'on_price', 'yes', 'quality', 4, 'tidy', true, 'use_again', 'yes');
$$;
grant execute on function public.mn_p() to authenticated;
create function public.mn_as(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
grant execute on function public.mn_as(text) to authenticated;

update public.settings set value = '["mn-admin@example.com","mn-mail@example.com"]'::jsonb where key = 'admin_emails';
insert into public.otp_requests (phone_e164, ip_hash, outcome, nonce_hash) values
  ('+447700900701', 'pgtap', 'approved', encode(sha256(convert_to('mn-701', 'UTF8')), 'hex')),
  ('+447700900702', 'pgtap', 'approved', encode(sha256(convert_to('mn-702', 'UTF8')), 'hex'));
insert into auth.users (id, created_at, email) values
  ('00000000-0000-0000-0000-00000000ca01', now() - interval '3 days', 'mn-admin@example.com'),
  ('00000000-0000-0000-0000-00000000ca02', now() - interval '3 days', 'mn-mail@example.com');
insert into auth.users (id, created_at, is_anonymous) values ('00000000-0000-0000-0000-00000000ca03', now() - interval '3 days', true);
insert into auth.users (id, created_at, phone, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000ca04', now() - interval '3 days', '447700900701', '{"bv_nonce":"mn-701"}'),
  ('00000000-0000-0000-0000-00000000ca05', now() - interval '3 days 1 hour', '447700900702', '{"bv_nonce":"mn-702"}');
update auth.users set phone_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000ca05';
-- An email-code account (Plan 2b): approved request + nonce, then confirmed by its code.
insert into public.email_requests (email_norm, ip_hash, outcome, nonce_hash)
values ('mn-eve@example.org', 'pgtap', 'approved', encode(sha256(convert_to('mn-eve', 'UTF8')), 'hex'));
insert into auth.users (id, created_at, email, raw_user_meta_data, raw_app_meta_data)
values ('00000000-0000-0000-0000-00000000ca06', now() - interval '3 days 2 hours', 'mn-eve@example.org', '{"bv_nonce":"mn-eve"}', '{"provider":"email"}');
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000ca06';
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-00000000ca01', 'admin', null),
  ('00000000-0000-0000-0000-00000000ca02', 'provider', 'Mel M.'),
  ('00000000-0000-0000-0000-00000000ca03', 'resident', 'Ann A.'),
  ('00000000-0000-0000-0000-00000000ca04', 'resident', 'Una U.'),
  ('00000000-0000-0000-0000-00000000ca05', 'resident', 'Con C.'),
  ('00000000-0000-0000-0000-00000000ca06', 'resident', 'Eve E.');

insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence, user_id) values
  ('00000000-0000-0000-0000-00000000cb01', 'mn-plumb', 'MN Plumb', '+447700900711', 'live', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000cb02', 'mn-cake', 'MN Cake', '+447700900712', 'live', now(), '{}'::jsonb,
   '00000000-0000-0000-0000-00000000ca02');
insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-00000000cb01'::uuid, id from public.categories where slug = 'plumber'
union all select '00000000-0000-0000-0000-00000000cb02', id from public.categories where slug = 'caterer';

-- Eleven published reviews of MN Cake by bare fixture reviewers, for the report limit and the reply.
insert into auth.users (id, created_at)
select ('00000000-0000-0000-0000-00000000cc' || lpad(n::text, 2, '0'))::uuid, now() - interval '5 days' from generate_series(1, 11) n;
insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, tidy, use_again)
select '00000000-0000-0000-0000-00000000cb02', ('00000000-0000-0000-0000-00000000cc' || lpad(n::text, 2, '0'))::uuid,
  (select id from public.categories where slug = 'caterer'), date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 4, null, 'yes'
from generate_series(1, 11) n;

set local role authenticated;
-- M1
select public.mn_as('00000000-0000-0000-0000-00000000ca02');
select throws_ok($$select public.t_submit_review(public.mn_p(), 'h')$$, 'P0001', 'not_member',
  'an email account (no mobile) cannot review');
select is(public.review_form_context('mn-plumb') ->> 'blocked', 'not_member', 'and the form says so');
select throws_ok($$select public.report_review((select min(id::text)::uuid from public.review_public), 'x')$$, 'P0001', 'not_member',
  'an email account cannot report');
select throws_ok($$select public.provider_reply((select min(id::text)::uuid from public.review_public where provider_id = '00000000-0000-0000-0000-00000000cb02'), 'Thanks')$$,
  'P0001', 'not_member', 'an email account linked to a listing cannot reply');
select public.mn_as('00000000-0000-0000-0000-00000000ca03');
select throws_ok($$select public.t_submit_review(public.mn_p(), 'h')$$, 'P0001', 'not_member', 'an anonymous session cannot review');
select public.mn_as('00000000-0000-0000-0000-00000000ca04');
select throws_ok($$select public.t_submit_review(public.mn_p(), 'h')$$, 'P0001', 'not_member',
  'a phone account whose number was never confirmed cannot review');
select public.mn_as('00000000-0000-0000-0000-00000000ca05');
select is(public.t_submit_review(public.mn_p(), 'h-con') ->> 'status', 'published', 'a confirmed phone account can');
select public.mn_as('00000000-0000-0000-0000-00000000ca06');
select ok(public.t_submit_review(public.mn_p(), 'h-eve') ->> 'status' is not null, 'an email-code account can (Plan 2b)');

-- M14
select is((select count(*)::int from (
  select public.report_review(r.id, 'Looks off') from (select id from public.review_public
  where provider_id = '00000000-0000-0000-0000-00000000cb02' order by id limit 10) r) x), 10, 'ten reports in a day are fine');
select throws_ok($$select public.report_review((select id from public.review_public
  where provider_id = '00000000-0000-0000-0000-00000000cb02' order by id offset 10 limit 1), 'And this')$$,
  'P0001', 'report_limit', 'the eleventh in 24 hours: report_limit');

-- M8
select public.mn_as('00000000-0000-0000-0000-00000000ca01');
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'admin_account', 'the admin account cannot delete itself');
reset role;
select is((select role::text || '/' || (deleted_at is null)::text
           from public.profiles where user_id = '00000000-0000-0000-0000-00000000ca01'), 'admin/true', 'the admin profile is untouched');

-- M4
insert into public.phone_retention (user_id, phone_e164, deleted_at, purge_after) values
  (gen_random_uuid(), '+447700900721', now() - interval '13 months', now() - interval '1 month'),
  (gen_random_uuid(), '+447700900722', now() - interval '1 month', now() + interval '11 months');
set local role service_role;
select verdict is not null as called from public.otp_verify_gate('+447700900723', 'pgtap-mn');
reset role;
select is((select string_agg(phone_e164, ',' order by phone_e164) from public.phone_retention
           where phone_e164 in ('+447700900721', '+447700900722')), '+447700900722',
  'a code check purges retention rows past their 12 months and keeps the rest');
select ok(exists (select 1 from public.review_public where provider_id = '00000000-0000-0000-0000-00000000cb02'), 'fixture sanity');

select * from finish();
rollback;
