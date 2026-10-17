-- "Manage your listing" after consent (000033): public.consent_trader_link issues a single-use trader link only for a
-- listing whose consent link was just used (30 minutes), only while it isn't linked to an account, and only for the
-- server (service role).
begin;
select plan(13);

insert into public.providers (id, slug, business_name, phone_e164, status, consent_token,
                              consent_token_used_at, consent_at, consent_evidence) values
  ('c1000000-0000-0000-0000-000000000001', 'ctl-fresh', 'CTL Fresh', '+447700901001', 'consented',
   'c1aaaaaa-0000-0000-0000-000000000001', now() - interval '2 minutes', now() - interval '2 minutes', '{}'::jsonb),
  ('c1000000-0000-0000-0000-000000000002', 'ctl-stale', 'CTL Stale', '+447700901002', 'consented',
   'c1aaaaaa-0000-0000-0000-000000000002', now() - interval '31 minutes', now() - interval '31 minutes', '{}'::jsonb);
insert into public.providers (id, slug, business_name, phone_e164, status, consent_token) values
  ('c1000000-0000-0000-0000-000000000003', 'ctl-invited', 'CTL Invited', '+447700901003', 'invited',
   'c1aaaaaa-0000-0000-0000-000000000003');

-- Server-only.
select ok(not has_function_privilege('anon', 'public.consent_trader_link(uuid)', 'execute'), 'anon cannot call it');
select ok(not has_function_privilege('authenticated', 'public.consent_trader_link(uuid)', 'execute'),
  'signed-in users cannot call it');
select ok(has_function_privilege('service_role', 'public.consent_trader_link(uuid)', 'execute'), 'the server can');

-- A fresh consent gets a link that the existing claim flow recognises.
create temp table ctl_r as select public.consent_trader_link('c1aaaaaa-0000-0000-0000-000000000001') as r;
select is((select r->>'state' from ctl_r), 'ok', 'a consent from 2 minutes ago gets a link');
select is((select count(*)::int from public.trader_link_tokens
           where provider_id = 'c1000000-0000-0000-0000-000000000001' and used_at is null and revoked_at is null),
  1, 'one active trader link for the listing');
select is((select token_hash from public.trader_link_tokens
           where provider_id = 'c1000000-0000-0000-0000-000000000001' and revoked_at is null),
  private.trader_link_hash(((select r->>'token' from ctl_r))::uuid), 'only the hash of the returned token is stored');
select ok(exists (select 1 from public.audit_log where action = 'consent_trader_link'
                  and target_id = 'c1000000-0000-0000-0000-000000000001'), 'it is audit-logged');

-- Asking again replaces the unused link rather than adding a second one.
select is((public.consent_trader_link('c1aaaaaa-0000-0000-0000-000000000001'))->>'state', 'ok', 'asking again works');
select is((select count(*)::int from public.trader_link_tokens
           where provider_id = 'c1000000-0000-0000-0000-000000000001' and used_at is null and revoked_at is null),
  1, 'still only one active link (the old one is revoked)');

-- Refusals.
select is((public.consent_trader_link('c1aaaaaa-0000-0000-0000-000000000002'))->>'state', 'unavailable',
  'not after 30 minutes');
select is((public.consent_trader_link('c1aaaaaa-0000-0000-0000-000000000003'))->>'state', 'unavailable',
  'not before consent is given');
select is((public.consent_trader_link(gen_random_uuid()))->>'state', 'unavailable', 'not for an unknown token');

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data)
values ('c1000000-0000-0000-0000-0000000000aa', 'ctl@example.com', now(), '{"provider":"google"}');
insert into auth.identities (provider_id, user_id, identity_data, provider)
values ('sub-ctl', 'c1000000-0000-0000-0000-0000000000aa', '{"sub":"sub-ctl","email":"ctl@example.com"}', 'google');
update public.providers set user_id = 'c1000000-0000-0000-0000-0000000000aa'
where id = 'c1000000-0000-0000-0000-000000000001';
select is((public.consent_trader_link('c1aaaaaa-0000-0000-0000-000000000001'))->>'state', 'unavailable',
  'not once the listing is linked to an account');

select * from finish();
rollback;
