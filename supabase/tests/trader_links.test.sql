-- Plan 2b Task 9: admin-issued trader sign-in links. Single use, 14 days, one active per listing (a new link
-- revokes the old), only the SHA-256 of the token stored. Claiming needs a finished profile and is refused when
-- the listing or the account is already linked. The admin can unlink with a logged reason. Listings linked by a
-- token stay linked when their numbers change; phone-linked ones still unlink (000003 behaviour).
begin;
select plan(39);

update public.settings set value = '["tl-admin@example.com"]'::jsonb where key = 'admin_emails';

create function public.tl_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function public.tl_as(uuid) to authenticated;

create function pg_temp.google_user(p_id uuid, p_email text, p_name text) returns void language plpgsql as $$
begin
  insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, created_at)
  values (p_id, p_email, now() - interval '3 days', '{"provider":"google"}', now() - interval '3 days');
  insert into auth.identities (provider_id, user_id, identity_data, provider)
  values ('sub-' || p_id::text, p_id, jsonb_build_object('sub', 'sub-' || p_id::text, 'email', p_email), 'google');
  insert into public.profiles (user_id, role, display_name) values (p_id, 'resident', p_name);
end $$;
create function pg_temp.email_user(p_id uuid, p_email text, p_name text) returns void language plpgsql as $$
begin
  insert into public.email_requests (email_norm, ip_hash, outcome, nonce_hash)
  values (private.normalise_email(p_email), 'pgtap-tl', 'approved', encode(sha256(convert_to('n-' || p_id::text, 'UTF8')), 'hex'));
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, created_at)
  values (p_id, p_email, jsonb_build_object('bv_nonce', 'n-' || p_id::text), '{"provider":"email"}', now() - interval '3 days');
  update auth.users set email_confirmed_at = now() - interval '3 days' where id = p_id;
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

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000071a0', 'tl-admin@example.com');
insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-0000000071a0', 'admin');
insert into public.providers (id, slug, business_name, phone_e164, status, consent_at, consent_evidence) values
  ('00000000-0000-0000-0000-0000000071b1', 'tl-ace', 'TL Ace', '+447700900931', 'live', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000071b2', 'tl-birch', 'TL Birch', '+447700900932', 'consented', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000071b3', 'tl-cedar', 'TL Cedar', '+447700900933', 'live', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000071b4', 'tl-phone', 'TL Phone', '+447700900934', 'live', now(), '{}'::jsonb);
insert into public.providers (id, slug, business_name, phone_e164, status) values
  ('00000000-0000-0000-0000-0000000071b5', 'tl-invited', 'TL Invited', '+447700900935', 'invited');

select pg_temp.google_user('00000000-0000-0000-0000-000000007101', 'gary@example.org', 'Gary G.');
select pg_temp.email_user('00000000-0000-0000-0000-000000007102', 'erin@example.org', 'Erin E.');
select pg_temp.phone_user('00000000-0000-0000-0000-000000007103', '447700900934', 'Phil P.');
-- Signed in, but Welcome not finished (no display name).
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data)
values ('00000000-0000-0000-0000-000000007104', 'nameless@example.org', now(), '{"provider":"google"}');
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('sub-nameless', '00000000-0000-0000-0000-000000007104', '{"sub":"sub-nameless"}', 'google');
insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-000000007104', 'resident');

create temp table t (k text primary key, token uuid, expires_at timestamptz);
grant all on t to authenticated;

-- ---------------------------------------------------------------- the admin makes a link
set local role authenticated;
select public.tl_as('00000000-0000-0000-0000-000000007101');
select throws_ok($$select public.admin_new_trader_link('00000000-0000-0000-0000-0000000071b1')$$, '42501', 'not admin',
  'a non-admin cannot make a trader link');
select public.tl_as('00000000-0000-0000-0000-0000000071a0');
insert into t select 'ace1', (j ->> 'token')::uuid, (j ->> 'expires_at')::timestamptz
from public.admin_new_trader_link('00000000-0000-0000-0000-0000000071b1') j;
select throws_ok($$select public.admin_new_trader_link('00000000-0000-0000-0000-0000000071b5')$$, '23514', 'provider not linkable',
  'an invited listing cannot get a trader link');
select ok((select (public.admin_get_provider('00000000-0000-0000-0000-0000000071b1') ->> 'trader_link_expires_at')::timestamptz
           = (select expires_at from t where k = 'ace1')), 'admin_get_provider shows the link''s expiry');
select is(public.admin_get_provider('00000000-0000-0000-0000-0000000071b1') ->> 'linked', 'false', 'and that the listing is not linked');
reset role;

select ok((select token is not null from t where k = 'ace1'), 'admin_new_trader_link returns a token');
select ok((select expires_at between now() + interval '14 days' - interval '1 minute' and now() + interval '14 days' + interval '1 minute'
           from t where k = 'ace1'), 'it expires in 14 days');
select is((select count(*)::int from public.trader_link_tokens
           where token_hash = encode(sha256(convert_to((select token from t where k = 'ace1')::text, 'UTF8')), 'hex')), 1,
  'only the SHA-256 of the token is stored');
select is((select count(*)::int from public.trader_link_tokens where token_hash = (select token from t where k = 'ace1')::text), 0,
  'never the token itself');
select is((select count(*)::int from public.audit_log where action = 'new_trader_link' and target_id = '00000000-0000-0000-0000-0000000071b1'
           and actor_id = '00000000-0000-0000-0000-0000000071a0'), 1, 'audit new_trader_link');

-- ---------------------------------------------------------------- a Google account claims it
set local role authenticated;
select public.tl_as('00000000-0000-0000-0000-000000007101');
select is(public.trader_link_preview((select token from t where k = 'ace1')),
  '{"state":"ok","business_name":"TL Ace"}'::jsonb, 'the preview names the business');
select is(public.claim_trader_link((select token from t where k = 'ace1')), 'tl-ace', 'claiming returns the slug');
reset role;
select is((select user_id from public.providers where slug = 'tl-ace'), '00000000-0000-0000-0000-000000007101'::uuid,
  'the listing is linked to the Google account');
select is((select role::text from public.profiles where user_id = '00000000-0000-0000-0000-000000007101'), 'provider',
  'the account becomes a provider');
select is((select count(*)::int from public.audit_log where action = 'claim_trader_link'
           and actor_id = '00000000-0000-0000-0000-000000007101' and target_id = '00000000-0000-0000-0000-0000000071b1'), 1,
  'audit claim_trader_link, by the account that opened it');
select ok((select used_at is not null and used_by = '00000000-0000-0000-0000-000000007101'::uuid from public.trader_link_tokens
           where token_hash = encode(sha256(convert_to((select token from t where k = 'ace1')::text, 'UTF8')), 'hex')),
  'the token is marked used');

-- ---------------------------------------------------------------- Review Focus 5: forwarded link
set local role authenticated;
select public.tl_as('00000000-0000-0000-0000-000000007102');
select is(public.trader_link_preview((select token from t where k = 'ace1')) ->> 'state', 'link_used', 'a second opener sees link_used');
select throws_ok($$select public.claim_trader_link((select token from t where k = 'ace1'))$$, 'P0001', 'link_used',
  'and cannot claim it');
select public.tl_as('00000000-0000-0000-0000-0000000071a0');
select throws_ok($$select public.admin_new_trader_link('00000000-0000-0000-0000-0000000071b1')$$, 'P0001', 'listing_already_linked',
  'no new link while the listing is linked');
select is(public.admin_get_provider('00000000-0000-0000-0000-0000000071b1') ->> 'linked', 'true', 'admin_get_provider shows it linked');
select throws_ok($$select public.admin_unlink_provider('00000000-0000-0000-0000-0000000071b1', '  ')$$, '23514', 'reason is required',
  'unlinking needs a reason');
select lives_ok($$select public.admin_unlink_provider('00000000-0000-0000-0000-0000000071b1', 'Wrong person opened the link')$$,
  'the admin unlinks with a reason');
reset role;
select is((select user_id from public.providers where slug = 'tl-ace'), null, 'the listing is unlinked');
select is((select reason from public.audit_log where action = 'unlink_provider' and target_id = '00000000-0000-0000-0000-0000000071b1'),
  'Wrong person opened the link', 'audit unlink_provider with the reason');
select is((select role::text from public.profiles where user_id = '00000000-0000-0000-0000-000000007101'), 'resident',
  'an account left with no listing goes back to resident');

-- A fresh link works for the right account; making another revokes it.
set local role authenticated;
select public.tl_as('00000000-0000-0000-0000-0000000071a0');
insert into t select 'ace2', (j ->> 'token')::uuid, null from public.admin_new_trader_link('00000000-0000-0000-0000-0000000071b1') j;
insert into t select 'ace3', (j ->> 'token')::uuid, null from public.admin_new_trader_link('00000000-0000-0000-0000-0000000071b1') j;
select public.tl_as('00000000-0000-0000-0000-000000007102');
select is(public.trader_link_preview((select token from t where k = 'ace2')) ->> 'state', 'link_invalid', 'a replaced link is invalid');
select throws_ok($$select public.claim_trader_link((select token from t where k = 'ace2'))$$, 'P0001', 'link_invalid',
  'and cannot be claimed');
select is(public.claim_trader_link((select token from t where k = 'ace3')), 'tl-ace', 'the newest link works for the right account');

-- Expired.
select public.tl_as('00000000-0000-0000-0000-0000000071a0');
insert into t select 'birch', (j ->> 'token')::uuid, null from public.admin_new_trader_link('00000000-0000-0000-0000-0000000071b2') j;
reset role;
update public.trader_link_tokens set expires_at = now() - interval '1 minute'
where token_hash = encode(sha256(convert_to((select token from t where k = 'birch')::text, 'UTF8')), 'hex');
set local role authenticated;
select public.tl_as('00000000-0000-0000-0000-000000007101');
select throws_ok($$select public.claim_trader_link((select token from t where k = 'birch'))$$, 'P0001', 'link_expired',
  'an expired link is refused');

-- An account already linked to another listing.
select public.tl_as('00000000-0000-0000-0000-0000000071a0');
insert into t select 'cedar', (j ->> 'token')::uuid, null from public.admin_new_trader_link('00000000-0000-0000-0000-0000000071b3') j;
select public.tl_as('00000000-0000-0000-0000-000000007102');
select is(public.trader_link_preview((select token from t where k = 'cedar')) ->> 'state', 'account_already_linked',
  'the preview says the account is already linked');
select throws_ok($$select public.claim_trader_link((select token from t where k = 'cedar'))$$, 'P0001', 'account_already_linked',
  'an account linked elsewhere cannot claim another listing');

-- No finished profile.
select public.tl_as('00000000-0000-0000-0000-000000007104');
select throws_ok($$select public.claim_trader_link((select token from t where k = 'cedar'))$$, 'P0001', 'not_member',
  'claiming needs a finished profile');

-- Unknown token.
select public.tl_as('00000000-0000-0000-0000-000000007101');
select is(public.trader_link_preview('00000000-0000-0000-0000-00000000dead'), '{"state":"link_invalid"}'::jsonb,
  'an unknown token is invalid, with no business name');
select throws_ok($$select public.claim_trader_link('00000000-0000-0000-0000-00000000dead')$$, 'P0001', 'link_invalid',
  'and cannot be claimed');
reset role;

-- ---------------------------------------------------------------- number changes
-- TL Ace is linked by token to an email account (no phone): an admin number change keeps the link.
update public.providers set phone_e164 = '+447700900999' where slug = 'tl-ace';
select is((select user_id from public.providers where slug = 'tl-ace'), '00000000-0000-0000-0000-000000007102'::uuid,
  'a token-linked listing stays linked when its number changes');
-- TL Phone is linked by its number to a phone account: a number change still unlinks (000003 behaviour).
set local role authenticated;
select public.tl_as('00000000-0000-0000-0000-000000007103');
select is(public.claim_provider_listings(), 1, 'the phone account claims its listing by number');
reset role;
update public.providers set phone_e164 = '+447700900998' where slug = 'tl-phone';
select is((select user_id from public.providers where slug = 'tl-phone'), null, 'a phone-linked listing unlinks when its number changes');

-- ---------------------------------------------------------------- privileges
set local role anon;
select throws_ok($$select public.claim_trader_link('00000000-0000-0000-0000-00000000dead')$$, '42501', null,
  'anon cannot claim');
select throws_ok($$select public.trader_link_preview('00000000-0000-0000-0000-00000000dead')$$, '42501', null,
  'anon cannot preview');
reset role;
set local role authenticated;
select throws_ok($$select * from public.trader_link_tokens$$, '42501', null, 'authenticated cannot read the tokens table');
reset role;

select * from finish();
rollback;
