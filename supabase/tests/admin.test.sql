begin;
select plan(63);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2');
insert into public.profiles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'admin'),
  ('00000000-0000-0000-0000-0000000000c2', 'resident');

-- ---- phone format constraints (ruling R9)
select throws_ok(
  $$insert into public.providers (slug, business_name, phone_e164) values ('bad-phone', 'Bad', '07700900123')$$,
  '23514', null, 'phone_e164 must be +44 E.164');
select throws_like(
  $$insert into public.providers (slug, business_name, phone_e164, whatsapp_e164) values ('bad-wa', 'Bad', '+447700900123', '12345')$$,
  '%providers_whatsapp_e164_format%', 'whatsapp_e164 must be +44 E.164 when set');

-- ---- unavailable to anon / unauthenticated, and to non-admins
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select throws_ok(
  $$select public.admin_upsert_provider('{"business_name":"X","phone_e164":"+447700900123"}'::jsonb)$$,
  null, 'not admin', 'non-admin cannot upsert provider');
select throws_ok(
  $$select public.admin_set_provider_status('00000000-0000-0000-0000-000000000001', 'paused', null)$$,
  null, 'not admin', 'non-admin cannot set status');
select throws_ok(
  $$select public.admin_record_check('00000000-0000-0000-0000-000000000001', 'id', null, null)$$,
  null, 'not admin', 'non-admin cannot record check');
select throws_ok(
  $$select public.admin_new_consent_token('00000000-0000-0000-0000-000000000001')$$,
  null, 'not admin', 'non-admin cannot rotate consent token');
select throws_ok(
  $$select public.admin_list_providers()$$, null, 'not admin', 'non-admin cannot list providers');
select throws_ok(
  $$select private.unique_slug('x')$$, '42501', null, 'unique_slug is not callable by authenticated');

set local role anon;
select throws_ok(
  $$select public.admin_upsert_provider('{"business_name":"X","phone_e164":"+447700900123"}'::jsonb)$$,
  '42501', null, 'anon has no execute on admin functions');
reset role;

-- ---- admin flow
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids select 'p1', public.admin_upsert_provider(jsonb_build_object(
  'business_name', 'Dave''s Bouncy Castles', 'phone_e164', '+447700900123', 'areas', jsonb_build_array('BL1', 'BL2'),
  'category_ids', jsonb_build_array((select id from public.categories where slug = 'plumber'))));
insert into ids select 'p2', public.admin_upsert_provider(jsonb_build_object(
  'business_name', 'Dave''s Bouncy Castles', 'phone_e164', '+447700900124'));

reset role;
select is((select slug from public.providers where id = (select v from ids where k = 'p1')), 'daves-bouncy-castles', 'first slug');
select is((select slug from public.providers where id = (select v from ids where k = 'p2')), 'daves-bouncy-castles-2', 'second slug gets -2');
select is((select status::text from public.providers where id = (select v from ids where k = 'p1')), 'invited', 'new provider is invited');
select is((select count(*)::int from public.provider_categories where provider_id = (select v from ids where k = 'p1')), 1, 'category set stored');
select is((select count(*)::int from public.audit_log where action = 'upsert_provider' and actor_id = '00000000-0000-0000-0000-0000000000c1'), 2, 'one audit row per upsert, actor is the admin');

-- update keeps the slug and replaces the category set
set local role authenticated;
select is(public.admin_upsert_provider(jsonb_build_object(
  'id', (select v from ids where k = 'p1'), 'business_name', 'Dave''s Castles Renamed', 'phone_e164', '+447700900125',
  'category_ids', jsonb_build_array((select id from public.categories where slug = 'electrician')))),
  (select v from ids where k = 'p1'), 'upsert with id updates');
reset role;
select is((select slug from public.providers where id = (select v from ids where k = 'p1')), 'daves-bouncy-castles', 'slug unchanged on update');
select is((select array_agg(c.slug) from public.provider_categories pc join public.categories c on c.id = pc.category_id
  where pc.provider_id = (select v from ids where k = 'p1')), array['electrician'], 'category set replaced');
set local role authenticated;
select throws_ok(
  $$select public.admin_upsert_provider(jsonb_build_object('id', (select v from ids where k = 'p1'), 'business_name', 'X', 'phone_e164', '+447700900125',
    'category_ids', (select jsonb_agg(id) from public.categories where slug in ('plumber', 'electrician', 'handyman', 'joiner'))))$$,
  null, 'max 3 categories', 'max-3 trigger still applies');

-- checks
select throws_ok(
  $$select public.admin_record_check((select v from ids where k = 'p1'), 'gas_safe', '123', null)$$,
  null, 'expiry required for gas_safe', 'gas_safe needs an expiry');
select throws_ok(
  $$select public.admin_record_check((select v from ids where k = 'p1'), 'dvsa_adi', '123', null)$$,
  null, 'expiry required for dvsa_adi', 'dvsa_adi needs an expiry');
select throws_ok(
  $$select public.admin_record_check((select v from ids where k = 'p1'), 'insurance', '123', null)$$,
  null, 'expiry required for insurance', 'insurance needs an expiry');
select lives_ok(
  $$select public.admin_record_check((select v from ids where k = 'p1'), 'id', 'seen passport', null)$$,
  'id check needs no expiry');
reset role;
select is((select count(*)::int from public.audit_log where action = 'record_check' and target_id = (select v::text from ids where k = 'p1')), 1,
  'record_check audited once (failed attempts leave nothing)');

-- consent token
create temp table tok (before uuid, after uuid);
grant all on tok to authenticated;
insert into tok select consent_token, null from public.providers where id = (select v from ids where k = 'p1');
set local role authenticated;
update tok set after = public.admin_new_consent_token((select v from ids where k = 'p1'));
reset role;

select isnt((select after from tok), (select before from tok), 'consent token rotated');
select is((select consent_token from public.providers where id = (select v from ids where k = 'p1')), (select after from tok), 'returned token is stored');
select is((select count(*)::int from public.audit_log where action = 'new_consent_token'), 1, 'new_consent_token audited');
set local role authenticated;


-- status
select throws_ok(
  $$select public.admin_set_provider_status((select v from ids where k = 'p1'), 'live', 'go live')$$,
  '23514', null, 'cannot go live without consent');
select lives_ok(
  $$select public.admin_set_provider_status((select v from ids where k = 'p1'), 'paused', 'testing')$$,
  'can pause');
select is(jsonb_array_length(public.admin_get_provider((select v from ids where k = 'p1')) -> 'checks'), 1, 'admin_get_provider returns checks');
reset role;
select is((select reason from public.audit_log where action = 'set_provider_status'), 'paused: testing', 'status audit keeps reason');
-- ---- consent flow (Task 8)
create temp table c (k text primary key, v uuid);
grant all on c to authenticated, service_role;
create temp table res (k text primary key, v text);
grant all on res to authenticated, service_role;
set local role authenticated;
insert into c select 'a', public.admin_upsert_provider(jsonb_build_object('business_name', 'Consent A', 'phone_e164', '+447700900131',
  'areas', jsonb_build_array('BL1'), 'category_ids', jsonb_build_array((select id from public.categories where slug = 'plumber'))));
insert into c select 'b', public.admin_upsert_provider(jsonb_build_object('business_name', 'Consent B', 'phone_e164', '+447700900132'));
insert into c select 'r', public.admin_upsert_provider(jsonb_build_object('business_name', 'Consent R', 'phone_e164', '+447700900133'));

-- R11: consent only via accept_consent; tokens only for invited providers
select throws_ok(
  $$select public.admin_set_provider_status((select v from c where k = 'a'), 'consented', 'sneaky')$$,
  '23514', null, 'admin cannot set status to consented');
reset role;
select is((select status::text from public.providers where id = (select v from c where k = 'a')), 'invited', 'status unchanged after refused consented');
select is((select count(*)::int from public.audit_log where action = 'set_provider_status' and target_id = (select v::text from c where k = 'a')), 0, 'refused consented leaves no audit row');

-- accept_consent / consent_preview are not callable by anon or authenticated
create temp table t (k text primary key, v uuid);
grant all on t to authenticated, anon, service_role;
insert into t select 'a', consent_token from public.providers where id = (select v from c where k = 'a');
insert into t select 'b', consent_token from public.providers where id = (select v from c where k = 'b');
insert into t select 'r', consent_token from public.providers where id = (select v from c where k = 'r');
set local role anon;
select throws_ok($$select public.accept_consent((select v from t where k = 'a'), '1.2.3.4', 'v', 'h', 'o', 'c')$$, '42501', null, 'anon cannot call accept_consent');
select throws_ok($$select * from public.consent_preview((select v from t where k = 'a'))$$, '42501', null, 'anon cannot call consent_preview');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select throws_ok($$select public.accept_consent((select v from t where k = 'a'), '1.2.3.4', 'v', 'h', 'o', 'c')$$, '42501', null, 'authenticated (even admin) cannot call accept_consent');
select throws_ok($$select * from public.consent_preview((select v from t where k = 'a'))$$, '42501', null, 'authenticated cannot call consent_preview');
reset role;

set local role service_role;
select is((select business_name from public.consent_preview((select v from t where k = 'a'))), 'Consent A', 'preview: business name');
select is((select categories from public.consent_preview((select v from t where k = 'a'))), array['Plumber'], 'preview: category names');
select is((select areas from public.consent_preview((select v from t where k = 'a'))), array['BL1'], 'preview: areas');
select is((select count(*)::int from public.consent_preview(gen_random_uuid())), 0, 'preview: unknown token gives no rows');

insert into res select 'ok1', public.accept_consent((select v from t where k = 'a'), '203.0.113.9', '2026-10-11', 'abc123', 'Jane Doe Ltd', 'jane@example.org');
reset role;
select is((select v from res where k = 'ok1'), 'ok', 'valid token accepted');
select is((select status::text from public.providers where id = (select v from c where k = 'a')), 'consented', 'status is consented');
select is((select consent_evidence ->> 'ip' from public.providers where id = (select v from c where k = 'a')), '203.0.113.9', 'evidence: ip');
select is((select consent_evidence ->> 'text_version' from public.providers where id = (select v from c where k = 'a')), '2026-10-11', 'evidence: text version');
select is((select consent_evidence ->> 'text_sha256' from public.providers where id = (select v from c where k = 'a')), 'abc123', 'evidence: text hash');
select is((select consent_evidence ->> 'owner_legal_name' from public.providers where id = (select v from c where k = 'a')), 'Jane Doe Ltd', 'evidence: owner');
select is((select consent_evidence ->> 'contact_email' from public.providers where id = (select v from c where k = 'a')), 'jane@example.org', 'evidence: contact email');
select is((select count(*)::int from public.audit_log where action = 'accept_consent' and actor_id is null and target_id = (select v::text from c where k = 'a')), 1, 'accept_consent audited once with null actor');

create temp table at (v timestamptz);
insert into at select consent_at from public.providers where id = (select v from c where k = 'a');
grant all on at to service_role;
set local role service_role;
insert into res select 'again', public.accept_consent((select v from t where k = 'a'), '198.51.100.1', 'other', 'zzz', 'o', 'c');
select is((select count(*)::int from public.consent_preview((select v from t where k = 'a'))), 0, 'preview: used token gives no rows');
reset role;
select is((select v from res where k = 'again'), 'invalid', 'same token again is invalid');
select is((select consent_at from public.providers where id = (select v from c where k = 'a')), (select v from at), 'consent_at unchanged on reuse');
select is((select consent_evidence ->> 'ip' from public.providers where id = (select v from c where k = 'a')), '203.0.113.9', 'evidence unchanged on reuse');

-- removed provider: token no longer works
update public.providers set status = 'removed' where id = (select v from c where k = 'b');
set local role service_role;
insert into res select 'removed', public.accept_consent((select v from t where k = 'b'), '1.1.1.1', 'v', 'h', 'o', 'c');
reset role;
select is((select v from res where k = 'removed'), 'invalid', 'removed provider token is invalid');
select is((select status::text from public.providers where id = (select v from c where k = 'b')), 'removed', 'removed provider unchanged');

-- rotated token invalidates the old one; rotation refused for non-invited
set local role authenticated;
create temp table rot (v uuid);
grant all on rot to authenticated, service_role;
insert into rot select public.admin_new_consent_token((select v from c where k = 'r'));
select throws_ok($$select public.admin_new_consent_token((select v from c where k = 'a'))$$, '23514', null, 'new consent token refused for a consented provider');
select throws_ok($$select public.admin_new_consent_token((select v from c where k = 'b'))$$, '23514', null, 'new consent token refused for a removed provider');
reset role;
set local role service_role;
insert into res select 'old', public.accept_consent((select v from t where k = 'r'), '1.1.1.1', 'v', 'h', 'o', 'c');
insert into res select 'new', public.accept_consent((select v from rot), '1.1.1.1', 'v', 'h', 'o', 'c');
reset role;
select is((select v from res where k = 'old'), 'invalid', 'rotated-out token is invalid');
select is((select v from res where k = 'new'), 'ok', 'new token works');

-- going live after consent
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select lives_ok($$select public.admin_set_provider_status((select v from c where k = 'a'), 'live', 'checked')$$, 'consented provider can go live');
reset role;
select is((select count(*)::int from public.provider_public where id = (select v from c where k = 'a')), 1, 'live provider appears in provider_public');
set local role authenticated;
select lives_ok($$select public.admin_set_provider_status((select v from c where k = 'a'), 'paused', 'break')$$, 'consented provider can be paused');
select lives_ok($$select public.admin_set_provider_status((select v from c where k = 'a'), 'live', 'back')$$, 'paused provider with consent can go live again');
reset role;
select * from finish();
rollback;
