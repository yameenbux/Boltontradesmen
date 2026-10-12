-- Plan 1 "fix early" follow-ups: removed is final, re-invite, consent token TTL,
-- reviews never deleted / removal reason non-blank, no whatsapp_tap without WhatsApp.
begin;
select plan(25);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000006a1'),  -- admin
  ('00000000-0000-0000-0000-0000000006a2');  -- reviewer
insert into public.profiles (user_id, role) values
  ('00000000-0000-0000-0000-0000000006a1', 'admin')
on conflict (user_id) do update set role = 'admin';

insert into public.providers (id, slug, business_name, phone_e164, whatsapp_e164, status, consent_at, consent_evidence) values
  ('00000000-0000-0000-0000-0000000006b1', 'fu-removed', 'FU Removed', '+447700900311', null, 'removed', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000006b2', 'fu-live', 'FU Live', '+447700900312', null, 'live', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000006b3', 'fu-wa', 'FU WhatsApp', '+447700900313', '+447700900313', 'live', now(), '{}'::jsonb);
insert into public.providers (id, slug, business_name, phone_e164, status) values
  ('00000000-0000-0000-0000-0000000006b4', 'fu-invited', 'FU Invited', '+447700900314', 'invited');

-- ---- removed is final (except through a new invite)
select throws_ok(
  $$update public.providers set status = 'paused' where id = '00000000-0000-0000-0000-0000000006b1'$$,
  '23514', 'a removed provider can only return through a new invite', 'removed -> paused refused');
select throws_ok(
  $$update public.providers set status = 'live' where id = '00000000-0000-0000-0000-0000000006b1'$$,
  '23514', 'a removed provider can only return through a new invite', 'removed -> live refused');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000006a1","role":"authenticated"}';
select throws_ok(
  $$select public.admin_reinvite_provider('00000000-0000-0000-0000-0000000006b2', 'come back')$$,
  '23514', null, 're-invite refused for a live provider');
select throws_ok(
  $$select public.admin_reinvite_provider('00000000-0000-0000-0000-0000000006b1', '   ')$$,
  '23514', null, 're-invite needs a non-blank reason');
create temp table reinv (v uuid);
grant all on reinv to authenticated;
insert into reinv select public.admin_reinvite_provider('00000000-0000-0000-0000-0000000006b1', 'asked to be listed again');
reset role;

select isnt((select v from reinv), null, 're-invite returns a token');
select is((select status::text from public.providers where id = '00000000-0000-0000-0000-0000000006b1'), 'invited', 're-invited provider is invited');
select is((select consent_at from public.providers where id = '00000000-0000-0000-0000-0000000006b1'), null, 're-invite clears consent_at');
select is((select consent_token from public.providers where id = '00000000-0000-0000-0000-0000000006b1'), (select v from reinv), 'returned token is stored');
select is((select count(*)::int from public.audit_log where action = 'reinvite_provider'
           and target_id = '00000000-0000-0000-0000-0000000006b1' and actor_id = '00000000-0000-0000-0000-0000000006a1'),
  1, 'one reinvite_provider audit row');

set local role anon;
select throws_ok(
  $$select public.admin_reinvite_provider('00000000-0000-0000-0000-0000000006b1', 'x')$$,
  '42501', null, 'anon cannot call admin_reinvite_provider');
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000006a3');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000006a3","role":"authenticated"}';
select throws_ok(
  $$select public.admin_reinvite_provider('00000000-0000-0000-0000-0000000006b1', 'x')$$,
  null, 'not admin', 'non-admin cannot re-invite');
reset role;

-- ---- reviews are never deleted, and a removal needs a non-blank reason
insert into public.reviews (id, provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, use_again)
values ('00000000-0000-0000-0000-0000000006c1', '00000000-0000-0000-0000-0000000006b2', '00000000-0000-0000-0000-0000000006a2',
  (select id from public.categories where slug = 'plumber'), date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 4, 'yes');
select throws_ok(
  $$delete from public.reviews where id = '00000000-0000-0000-0000-0000000006c1'$$,
  null, 'reviews are never deleted', 'delete from reviews refused');
select throws_ok(
  $$update public.reviews set status = 'removed', removal_reason = '  ' where id = '00000000-0000-0000-0000-0000000006c1'$$,
  '23514', null, 'blank removal reason refused');
select lives_ok(
  $$update public.reviews set status = 'removed', removal_reason = 'fake' where id = '00000000-0000-0000-0000-0000000006c1'$$,
  'removal with a reason works');

-- ---- consent tokens expire
create temp table ftok (k text primary key, v uuid);
grant all on ftok to authenticated, service_role;
insert into ftok select 'invited', consent_token from public.providers where id = '00000000-0000-0000-0000-0000000006b4';
set local role service_role;
select is((select count(*)::int from public.consent_preview((select v from ftok where k = 'invited'))), 1, 'fresh token previews');
reset role;
update public.providers set consent_token_expires_at = now() - interval '1 minute' where id = '00000000-0000-0000-0000-0000000006b4';
set local role service_role;
select is((select count(*)::int from public.consent_preview((select v from ftok where k = 'invited'))), 0, 'expired token: no preview');
select is(public.accept_consent((select v from ftok where k = 'invited'), '1.1.1.1', 'v', 'h', 'o', 'c'), 'invalid', 'expired token: accept_consent invalid');
reset role;
select is((select status::text from public.providers where id = '00000000-0000-0000-0000-0000000006b4'), 'invited', 'expired token leaves the provider invited');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000006a1","role":"authenticated"}';
insert into ftok select 'rotated', public.admin_new_consent_token('00000000-0000-0000-0000-0000000006b4');
select ok(
  (public.admin_get_provider('00000000-0000-0000-0000-0000000006b4') ->> 'consent_token_expires_at')::timestamptz
    between now() + interval '13 days 23 hours' and now() + interval '14 days 1 minute',
  'a new consent token resets the expiry to 14 days (admin_get_provider shows it)');
reset role;
set local role service_role;
select is((select count(*)::int from public.consent_preview((select v from ftok where k = 'rotated'))), 1, 'rotated token previews again');
select is(public.accept_consent((select v from ftok where k = 'rotated'), '1.1.1.1', 'v', 'h', 'o', 'c'), 'ok', 'rotated token accepts');
reset role;

-- ---- whatsapp_tap is not logged for a provider without WhatsApp
create temp table cnt (k text primary key, n int);
insert into cnt select 'before', count(*)::int from public.contact_events;
set local role service_role;
select is((select phone_e164 from public.log_contact('fu-live', 'whatsapp_tap', null, 'h')), '+447700900312',
  'whatsapp_tap without WhatsApp still returns the row');
reset role;
select is((select count(*)::int from public.contact_events), (select n from cnt where k = 'before'),
  'whatsapp_tap without WhatsApp inserts nothing');
set local role service_role;
select is((select count(*)::int from public.log_contact('fu-live', 'call_tap', null, 'h')), 1, 'call_tap returns the row');
reset role;
select is((select count(*)::int from public.contact_events), (select n from cnt where k = 'before') + 1, 'call_tap still inserts');

select * from finish();
rollback;
