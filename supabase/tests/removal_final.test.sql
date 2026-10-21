-- Final review 2, I2: "removal is final" must survive deleting the account and signing up again with the
-- same mobile number. phone_retention keeps a deleted person's number for 12 months; review_block_reason
-- refuses a new account on that number for any provider where the old account's review was removed for
-- cause, and carries an admin block across too.
begin;
select plan(9);

create function public.t_submit_review(p jsonb, h text) returns jsonb
language sql security definer set search_path = '' as $$ select public.submit_review(auth.uid(), p, h) $$;
grant execute on function public.t_submit_review(jsonb, text) to authenticated;

-- A review payload for a plumber listing.
create function public.rf_p(p_provider uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'provider_id', p_provider, 'category_id', (select id from public.categories where slug = 'plumber'),
    'job_month', to_char(date_trunc('month', now() at time zone 'Europe/London'), 'YYYY-MM-01'),
    'value_band', '<250', 'on_time', 'yes', 'on_price', 'yes', 'quality', 4, 'tidy', true, 'use_again', 'yes');
$$;
grant execute on function public.rf_p(uuid) to authenticated;

-- Phone accounts need an approved sign-in request with a nonce (the auth.users guard).
create function public.rf_phone_user(p_id uuid, p_phone text, p_nonce text, p_age interval) returns void
language sql as $$
  insert into public.otp_requests (phone_e164, ip_hash, outcome, nonce_hash)
  values ('+' || p_phone, 'pgtap', 'approved', encode(sha256(convert_to(p_nonce, 'UTF8')), 'hex'));
  insert into auth.users (id, phone, created_at, raw_user_meta_data)
  values (p_id, p_phone, now() - p_age, jsonb_build_object('bv_nonce', p_nonce));
  update auth.users set phone_confirmed_at = now() where id = p_id;  -- they typed the code
$$;

insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence) values
  ('00000000-0000-0000-0000-00000000fb01', 'rf-final-1', 'RF Final One', '+447700900601', 'live', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-00000000fb02', 'rf-final-2', 'RF Final Two', '+447700900602', 'live', now(), '{}'::jsonb);
insert into public.provider_categories (provider_id, category_id)
select p.id, c.id from public.providers p, public.categories c where p.slug like 'rf-final-%' and c.slug = 'plumber';

-- Rob: his review of RF Final One was removed by the admin. Bea: blocked by the admin.
-- Cal: deleted his own account (his review was removed only because of that).
select public.rf_phone_user('00000000-0000-0000-0000-00000000fa01', '447700900611', 'rob-1', interval '3 days');
select public.rf_phone_user('00000000-0000-0000-0000-00000000fa02', '447700900612', 'bea-1', interval '3 days');
select public.rf_phone_user('00000000-0000-0000-0000-00000000fa03', '447700900613', 'cal-1', interval '3 days');
insert into public.profiles (user_id, role, display_name, blocked_at) values
  ('00000000-0000-0000-0000-00000000fa01', 'resident', 'Rob R.', null),
  ('00000000-0000-0000-0000-00000000fa02', 'resident', 'Bea B.', now()),
  ('00000000-0000-0000-0000-00000000fa03', 'resident', 'Cal C.', null);
insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, tidy, use_again, status, removal_reason)
values
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa01', (select id from public.categories where slug = 'plumber'),
   date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 5, true, 'yes', 'removed', 'Fake: not a real customer'),
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fa03', (select id from public.categories where slug = 'plumber'),
   date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 4, true, 'yes', 'published', null);

-- Each deletes the account (as the app does: delete_my_account, then GoTrue's soft delete).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000fa01","role":"authenticated","aal":"aal2"}';
select public.delete_my_account();
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000fa02","role":"authenticated","aal":"aal2"}';
select public.delete_my_account();
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000fa03","role":"authenticated","aal":"aal2"}';
select public.delete_my_account();
reset role;
update auth.users set deleted_at = now(), phone = 'deleted-' || right(id::text, 4)
where id in ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000fa03');
select is((select count(*)::int from public.phone_retention where phone_e164 in ('+447700900611', '+447700900612', '+447700900613')), 3,
  'the three numbers are kept in phone_retention');

-- They sign up again with the same numbers (new user ids), old enough that the 24-hour rule stays out of it.
select public.rf_phone_user('00000000-0000-0000-0000-00000000fa11', '447700900611', 'rob-2', interval '2 days');
select public.rf_phone_user('00000000-0000-0000-0000-00000000fa12', '447700900612', 'bea-2', interval '2 days 1 hour');
select public.rf_phone_user('00000000-0000-0000-0000-00000000fa13', '447700900613', 'cal-2', interval '2 days 2 hours');
insert into public.profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-00000000fa11', 'resident', 'Rob R.'),
  ('00000000-0000-0000-0000-00000000fa12', 'resident', 'Bea B.'),
  ('00000000-0000-0000-0000-00000000fa13', 'resident', 'Cal C.');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000fa11","role":"authenticated","aal":"aal2"}';
select throws_ok($$select public.t_submit_review(public.rf_p('00000000-0000-0000-0000-00000000fb01'), 'h')$$,
  'P0001', 'removed_before', 'a new account on the same number cannot review a provider again after a removal for cause');
select is((public.review_form_context('rf-final-1') ->> 'blocked'), 'removed_before', 'and the form says so');
select is((public.t_submit_review(public.rf_p('00000000-0000-0000-0000-00000000fb02'), 'h-rob')) ->> 'status', 'published',
  'other providers are still open to that number');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000fa12","role":"authenticated","aal":"aal2"}';
select throws_ok($$select public.t_submit_review(public.rf_p('00000000-0000-0000-0000-00000000fb01'), 'h')$$,
  'P0001', 'blocked', 'an admin block carries across to a new account on the same number');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000fa13","role":"authenticated","aal":"aal2"}';
select is((public.t_submit_review(public.rf_p('00000000-0000-0000-0000-00000000fb01'), 'h-cal')) ->> 'status', 'published',
  'a removal caused only by deleting the account does not block the same number');
reset role;

-- After the 12 months, the number is purged and no longer blocks.
update public.phone_retention set purge_after = now() - interval '1 day' where phone_e164 = '+447700900611';
-- (Plan 2b: the lookup now uses the hashed key kept alongside it in identity_retention.)
update public.identity_retention set purge_after = now() - interval '1 day' where user_id = '00000000-0000-0000-0000-00000000fa01';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000fa11","role":"authenticated","aal":"aal2"}';
select is((public.review_form_context('rf-final-1') ->> 'blocked'), null, 'an expired retention row no longer blocks');
reset role;
-- A fixture user with no phone at all is unaffected.
insert into auth.users (id, created_at) values ('00000000-0000-0000-0000-00000000fa20', now() - interval '3 days');
insert into public.profiles (user_id, role, display_name) values ('00000000-0000-0000-0000-00000000fa20', 'resident', 'Nod N.');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000fa20","role":"authenticated","aal":"aal2"}';
select is((public.review_form_context('rf-final-1') ->> 'blocked'), null, 'an account without a phone is not matched to anyone');
reset role;
select ok(not has_function_privilege('authenticated', 'private.review_block_reason(uuid, uuid)', 'execute'),
  'review_block_reason stays private');

select * from finish();
rollback;
