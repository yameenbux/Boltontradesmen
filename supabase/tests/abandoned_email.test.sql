-- Plan 2b Task 6 (review concern from Tasks 1-4): an email account that asked for a code but never used it
-- ("abandoned": unconfirmed, never signed in, no phone, no other identity, no profile, older than the 15-minute
-- code expiry) must not lock its mailbox out. A later Google sign-in, or an email code for a dot/+tag variant
-- of the same mailbox, is accepted and the abandoned account is removed, so there is still one account per
-- normalised address. A fresh (under 15 minutes) or confirmed account still blocks as before.
-- GoTrue's inserts are simulated here as postgres.
begin;
select plan(16);

update public.settings set value = '["bv-admin@example.com"]'::jsonb where key = 'admin_emails';

create function pg_temp.h(p text) returns text language sql as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
create function pg_temp.approved(p_email text, p_nonce text) returns bigint language sql as $$
  insert into public.email_requests (email_norm, ip_hash, outcome, nonce_hash)
  values (private.normalise_email(p_email), 'pgtap-abandoned', 'approved', pg_temp.h(p_nonce))
  returning id
$$;
create function pg_temp.signup(p_id uuid, p_email text, p_meta jsonb, p_provider text default 'email') returns void
language sql as $$
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (p_id, p_email, p_meta, jsonb_build_object('provider', p_provider, 'providers', jsonb_build_array(p_provider)));
  insert into auth.identities (provider_id, user_id, identity_data, provider)
  values (p_id::text, p_id, jsonb_build_object('sub', p_id::text, 'email', p_email), 'email')
  on conflict do nothing;
$$;
-- An email-code sign-up as the app makes it (approved request + nonce), created p_age ago and never confirmed.
create function pg_temp.email_signup(p_id uuid, p_email text, p_age interval) returns void language plpgsql as $$
begin
  perform pg_temp.approved(p_email, 'n-' || p_id::text);
  perform pg_temp.signup(p_id, p_email, jsonb_build_object('bv_nonce', 'n-' || p_id::text));
  update auth.users set created_at = now() - p_age where id = p_id;
end $$;
create function pg_temp.live(p_id uuid) returns boolean language sql as $$
  select exists (select 1 from auth.users where id = p_id and deleted_at is null)
$$;

-- 1. Google with a dot variant of an abandoned email account's Gmail ---------------------------------------
select pg_temp.email_signup('00000000-0000-0000-0000-0000000ab001', 'Sarah.Khan@gmail.com', '20 minutes');
select ok(private.abandoned_email_account('00000000-0000-0000-0000-0000000ab001'),
  'an unconfirmed, never-used email account older than 15 minutes is abandoned');
select ok(not private.email_norm_taken('sarahkhan@gmail.com'), 'an abandoned account does not hold its address');
select lives_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ab002', 'sarahkhan@gmail.com', '{}', 'google')$$,
  'a later Google sign-in with a dot variant is accepted');
select ok(not pg_temp.live('00000000-0000-0000-0000-0000000ab001'), '… and the abandoned account is removed');
select ok(not exists (select 1 from auth.identities where user_id = '00000000-0000-0000-0000-0000000ab001'),
  '… with its identity');
select ok(pg_temp.live('00000000-0000-0000-0000-0000000ab002'), 'the Google account is live');

-- 2. A fresh unconfirmed account (its code may still be on its way) still blocks ---------------------------
select pg_temp.email_signup('00000000-0000-0000-0000-0000000ab003', 'jo.bloggs@gmail.com', '5 minutes');
select ok(not private.abandoned_email_account('00000000-0000-0000-0000-0000000ab003'),
  'an unconfirmed account under 15 minutes old is not abandoned');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ab004', 'jobloggs@gmail.com', '{}', 'google')$$,
  '23505', 'email already registered', 'a Google variant of a fresh unconfirmed account is still refused');

-- 3. A confirmed (used) account still blocks, however old --------------------------------------------------
select pg_temp.email_signup('00000000-0000-0000-0000-0000000ab005', 'used.person@gmail.com', '30 days');
update auth.users set email_confirmed_at = now() - interval '29 days', last_sign_in_at = now() - interval '29 days'
where id = '00000000-0000-0000-0000-0000000ab005';
select ok(not private.abandoned_email_account('00000000-0000-0000-0000-0000000ab005'), 'a confirmed account is not abandoned');
select throws_ok($$select pg_temp.signup('00000000-0000-0000-0000-0000000ab006', 'usedperson@gmail.com', '{}', 'google')$$,
  '23505', 'email already registered', 'a Google variant of a confirmed account is refused');

-- 4. An email code for a +tag variant of an abandoned account --------------------------------------------
select pg_temp.email_signup('00000000-0000-0000-0000-0000000ab007', 'pat+old@example.org', '1 hour');
select is((select verdict from public.email_gate('pat@example.org', 'pgtap-abandoned-ip')), 'ok',
  'email_gate does not call the address taken by an abandoned account');
select lives_ok($$select pg_temp.email_signup('00000000-0000-0000-0000-0000000ab008', 'pat@example.org', '0 minutes')$$,
  'the new email-code account is accepted');
select ok(not pg_temp.live('00000000-0000-0000-0000-0000000ab007'), '… and the abandoned one is removed');

-- 5. An unconfirmed account that also has a Google identity is never abandoned ----------------------------
select pg_temp.email_signup('00000000-0000-0000-0000-0000000ab009', 'linked.person@gmail.com', '2 hours');
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('sub-ab009', '00000000-0000-0000-0000-0000000ab009', '{"sub":"sub-ab009"}', 'google');
select ok(not private.abandoned_email_account('00000000-0000-0000-0000-0000000ab009'),
  'an account with a Google identity is not abandoned');

-- 6. Not callable by API roles ------------------------------------------------------------------------------
set local role authenticated;
select throws_ok($$select private.abandoned_email_account('00000000-0000-0000-0000-0000000ab001')$$, '42501', null,
  'authenticated cannot call abandoned_email_account');
reset role;
set local role service_role;
select throws_ok($$select private.drop_abandoned_email_accounts('x@example.org', null)$$, '42501', null,
  'service_role cannot call drop_abandoned_email_accounts');
reset role;

select * from finish();
rollback;
