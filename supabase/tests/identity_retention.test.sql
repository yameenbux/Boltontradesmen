-- Plan 2b Task 7: hashed sign-in identity keys. A per-project pepper (private.secrets) turns a confirmed phone
-- (E.164), a confirmed email (normalised) and each Google subject id into HMAC keys. Deleting an account keeps
-- its keys for 12 months in identity_retention (never the plain email or Google id), so a removal for cause or
-- an admin block survives signing up again with Google or an email code. phone_signed_in now means "signed in
-- with Google, an email code or a confirmed phone".
-- GoTrue's inserts and soft delete are simulated here as postgres.
begin;
select plan(25);

update public.settings set value = '["ir-admin@example.com"]'::jsonb where key = 'admin_emails';

create function public.t_submit_review(p jsonb, h text) returns jsonb
language sql security definer set search_path = '' as $$ select public.submit_review(auth.uid(), p, h) $$;
grant execute on function public.t_submit_review(jsonb, text) to authenticated;
create function public.ir_p(p_provider uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'provider_id', p_provider, 'category_id', (select id from public.categories where slug = 'plumber'),
    'job_month', to_char(date_trunc('month', now() at time zone 'Europe/London'), 'YYYY-MM-01'),
    'value_band', '<250', 'on_time', 'yes', 'on_price', 'yes', 'quality', 4, 'tidy', true, 'use_again', 'yes');
$$;
grant execute on function public.ir_p(uuid) to authenticated;

-- An email-code account as the app makes it (approved request + nonce), then confirmed by its code.
create function pg_temp.email_user(p_id uuid, p_email text, p_age interval default '3 days') returns void language plpgsql as $$
begin
  insert into public.email_requests (email_norm, ip_hash, outcome, nonce_hash)
  values (private.normalise_email(p_email), 'pgtap-ir', 'approved', encode(sha256(convert_to('n-' || p_id::text, 'UTF8')), 'hex'));
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, created_at)
  values (p_id, p_email, jsonb_build_object('bv_nonce', 'n-' || p_id::text), '{"provider":"email"}', now() - p_age);
  update auth.users set email_confirmed_at = now() - p_age, last_sign_in_at = now() where id = p_id;
end $$;
-- A Google account: GoTrue inserts the user (provider google, email verified by Google) and its identity.
create function pg_temp.google_user(p_id uuid, p_email text, p_sub text, p_age interval default '3 days') returns void
language plpgsql as $$
begin
  insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, created_at)
  values (p_id, p_email, now() - p_age, '{"provider":"google"}', now() - p_age);
  insert into auth.identities (provider_id, user_id, identity_data, provider)
  values (p_sub, p_id, jsonb_build_object('sub', p_sub, 'email', p_email), 'google');
end $$;
create function pg_temp.member(p_id uuid, p_name text) returns void language sql as $$
  insert into public.profiles (user_id, role, display_name) values (p_id, 'resident', p_name);
$$;
-- The app's deletion: delete_my_account as the person, then GoTrue's soft delete (obfuscates, drops identities).
create function pg_temp.delete_account(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.delete_my_account();
  reset role;
  delete from auth.identities where user_id = p_id;
  update auth.users set deleted_at = now(), email = p_id::text || '@deleted.invalid' where id = p_id;
end $$;
create function pg_temp.block_reason(p_id uuid, p_provider uuid) returns text language sql as $$
  select private.review_block_reason(p_id, p_provider)
$$;

insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence) values
  ('00000000-0000-0000-0000-0000000000d1', 'ir-p', 'IR P Plumbing', '+447700900801', 'live', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d2', 'ir-q', 'IR Q Plumbing', '+447700900802', 'live', now(), '{}'::jsonb);
insert into public.provider_categories (provider_id, category_id)
select p.id, c.id from public.providers p, public.categories c where p.slug in ('ir-p', 'ir-q') and c.slug = 'plumber';
create function pg_temp.removed_review(p_reviewer uuid, p_reason text) returns void language sql as $$
  insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, tidy, use_again, status, removal_reason)
  values ('00000000-0000-0000-0000-0000000000d1', p_reviewer, (select id from public.categories where slug = 'plumber'),
          date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 5, true, 'yes', 'removed', p_reason);
$$;

-- ---------------------------------------------------------------- keys
select pg_temp.email_user('00000000-0000-0000-0000-0000000000a1', 'Sarah.Khan+x@gmail.com');
select pg_temp.google_user('00000000-0000-0000-0000-0000000000a2', 'gus@example.org', 'sub-gus');
select is(array_length(private.identity_keys('00000000-0000-0000-0000-0000000000a1'), 1), 1, 'an email account has one key');
select is(private.identity_keys('00000000-0000-0000-0000-0000000000a1'),
  array[private.identity_key('email', 'sarahkhan@gmail.com')], '… for its normalised address');
select ok(private.identity_keys('00000000-0000-0000-0000-0000000000a2') @>
  array[private.identity_key('google', 'sub-gus'), private.identity_key('email', 'gus@example.org')],
  'a Google account has its subject key and its email key');
select matches(private.identity_key('email', 'sarahkhan@gmail.com'), '^[0-9a-f]{64}$', 'keys are 64 hex');
select isnt(private.identity_key('email', 'sarahkhan@gmail.com'),
  encode(sha256(convert_to('email:sarahkhan@gmail.com', 'UTF8')), 'hex'), 'keys are keyed (not a plain sha256)');
select isnt(private.identity_key('email', 'x'), private.identity_key('google', 'x'), 'the kind is part of the key');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a9');
select is(private.identity_keys('00000000-0000-0000-0000-0000000000a9'), '{}'::text[], 'no confirmed identity → no keys');

-- ---------------------------------------------------------------- removal survives re-signup (Google)
select pg_temp.member('00000000-0000-0000-0000-0000000000a2', 'Gus G.');
select pg_temp.removed_review('00000000-0000-0000-0000-0000000000a2', 'Fake: not a real customer');
select pg_temp.delete_account('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.identity_retention where user_id = '00000000-0000-0000-0000-0000000000a2'), 2,
  'deleting a Google account keeps its two keys');
select ok(not exists (select 1 from public.identity_retention where identity_key in ('sub-gus', 'gus@example.org')),
  'never the plain email or Google id');
-- Same Google account (sub), a different email this time.
select pg_temp.google_user('00000000-0000-0000-0000-0000000000a3', 'gus.new@example.org', 'sub-gus', '2 days');
select pg_temp.member('00000000-0000-0000-0000-0000000000a3', 'Gus G.');
select is(pg_temp.block_reason('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000d1'), 'removed_before',
  'a new Google account with the same subject cannot review P again');
select is(pg_temp.block_reason('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000d2'), null,
  '… but may review Q');

-- ---------------------------------------------------------------- removal survives re-signup (email)
select pg_temp.member('00000000-0000-0000-0000-0000000000a1', 'Sarah K.');
select pg_temp.removed_review('00000000-0000-0000-0000-0000000000a1', 'Spam');
select pg_temp.delete_account('00000000-0000-0000-0000-0000000000a1');
select pg_temp.email_user('00000000-0000-0000-0000-0000000000a4', 'sarahkhan@gmail.com', '2 days');
select pg_temp.member('00000000-0000-0000-0000-0000000000a4', 'Sarah K.');
select is(pg_temp.block_reason('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000d1'), 'removed_before',
  'a new email account with a dot-variant Gmail cannot review P again');

-- A removal caused only by deleting the account does not count.
select pg_temp.email_user('00000000-0000-0000-0000-0000000000a5', 'del@example.org');
select pg_temp.member('00000000-0000-0000-0000-0000000000a5', 'Del D.');
select pg_temp.removed_review('00000000-0000-0000-0000-0000000000a5', 'Reviewer deleted their account');
select pg_temp.delete_account('00000000-0000-0000-0000-0000000000a5');
select pg_temp.email_user('00000000-0000-0000-0000-0000000000a6', 'del+again@example.org', '2 days');
select pg_temp.member('00000000-0000-0000-0000-0000000000a6', 'Del D.');
select is(pg_temp.block_reason('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000d1'), null,
  'a removal caused only by deleting the account does not block');

-- After the 12 months the keys are purged and no longer block.
update public.identity_retention set purge_after = now() - interval '1 day'
where user_id = '00000000-0000-0000-0000-0000000000a1';
select is(pg_temp.block_reason('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000d1'), null,
  'an expired retention row no longer blocks');
select is((select verdict from public.email_verify_gate('purge@example.org', 'pgtap-ir-ip')), 'ok', 'a code check runs');
select ok(not exists (select 1 from public.identity_retention where user_id = '00000000-0000-0000-0000-0000000000a1'),
  '… and purges expired identity_retention rows');

-- ---------------------------------------------------------------- blocked survives
select pg_temp.email_user('00000000-0000-0000-0000-0000000000a7', 'bea@example.org');
insert into public.profiles (user_id, role, display_name, blocked_at) values ('00000000-0000-0000-0000-0000000000a7', 'resident', 'Bea B.', now());
select pg_temp.delete_account('00000000-0000-0000-0000-0000000000a7');
select pg_temp.email_user('00000000-0000-0000-0000-0000000000a8', 'BEA@example.org', '2 days');
select pg_temp.member('00000000-0000-0000-0000-0000000000a8', 'Bea B.');
select is(pg_temp.block_reason('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000000d2'), 'blocked',
  'an admin block carries across to a new account on the same key');

-- ---------------------------------------------------------------- backfill
-- A phone_retention row from before the migration (the migration runs this same backfill once).
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000c1');
insert into public.phone_retention (user_id, phone_e164, deleted_at, purge_after)
values ('00000000-0000-0000-0000-0000000000c1', '+447700900899', now() - interval '1 month', now() + interval '11 months');
select private.backfill_identity_retention();
select private.backfill_identity_retention();  -- re-runnable
select ok(not exists (
  select 1 from public.phone_retention pr
  where not exists (select 1 from public.identity_retention ir
                    where ir.user_id = pr.user_id and ir.identity_key = private.identity_key('phone', pr.phone_e164))
), 'every phone_retention row has a matching identity_retention row (backfill)');
select is((select count(*)::int from public.identity_retention ir join public.phone_retention pr using (user_id)
           where pr.phone_e164 = '+447700900899' and ir.deleted_at = pr.deleted_at and ir.purge_after = pr.purge_after), 1,
  '… once, with the same dates');

-- ---------------------------------------------------------------- phone_signed_in
insert into public.otp_requests (phone_e164, ip_hash, outcome, nonce_hash)
values ('+447700900811', 'pgtap', 'approved', encode(sha256(convert_to('ir-phone', 'UTF8')), 'hex'));
insert into auth.users (id, phone, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000b1', '447700900811', '{"bv_nonce":"ir-phone"}');
update auth.users set phone_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000b1';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b2', 'ir-admin@example.com');
insert into public.email_requests (email_norm, ip_hash, outcome, nonce_hash)
values ('unconfirmed@example.org', 'pgtap-ir', 'approved', encode(sha256(convert_to('ir-unconf', 'UTF8')), 'hex'));
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values ('00000000-0000-0000-0000-0000000000b3', 'unconfirmed@example.org', '{"bv_nonce":"ir-unconf"}', '{"provider":"email"}');
select ok(private.phone_signed_in('00000000-0000-0000-0000-0000000000a3') and private.phone_signed_in('00000000-0000-0000-0000-0000000000a4')
  and private.phone_signed_in('00000000-0000-0000-0000-0000000000b1'), 'google, email and phone accounts are signed in');
select ok(not private.phone_signed_in('00000000-0000-0000-0000-0000000000b2'), 'the admin is not');
select ok(not private.phone_signed_in('00000000-0000-0000-0000-0000000000b3'), 'an unconfirmed email account is not');

-- ---------------------------------------------------------------- privileges
set local role authenticated;
select throws_ok($$select * from public.identity_retention$$, '42501', null, 'authenticated cannot read identity_retention');
reset role;
set local role service_role;
select throws_ok($$select * from public.identity_retention$$, '42501', null, 'service_role cannot read identity_retention');
select throws_ok($$select * from private.secrets$$, '42501', null, 'service_role cannot read private.secrets');
reset role;

select * from finish();
rollback;
