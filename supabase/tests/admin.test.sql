begin;
select plan(30);

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
select * from finish();
rollback;
