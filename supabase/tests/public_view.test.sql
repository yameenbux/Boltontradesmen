begin;
select plan(17);

select columns_are('public', 'provider_public', array[
  'id', 'slug', 'business_name', 'contact_name', 'areas', 'bio', 'is_verified', 'has_whatsapp',
  'category_slugs', 'checks', 'review_count', 'use_again_pct', 'on_time_pct', 'on_price_pct',
  'tidy_pct', 'score', 'last_review_at', 'created_at'
], 'provider_public exposes exactly the public columns');

-- fixtures: one live (verified, whatsapp), one live bare, one paused, one invited
insert into public.providers (id, slug, business_name, phone_e164, whatsapp_e164, status, consent_at, consent_evidence, verified_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'pv-live', 'Live One', '+447700900201', '+447700900201', 'live', now(), '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-0000000000c2', 'pv-bare', 'Live Bare', '+447700900202', null, 'live', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000000c3', 'pv-paused', 'Paused', '+447700900203', null, 'paused', now(), '{}'::jsonb, null),
  ('00000000-0000-0000-0000-0000000000c4', 'pv-invited', 'Invited', '+447700900204', null, 'invited', null, null, null);

insert into public.provider_checks (provider_id, kind, reference, expires_on) values
  ('00000000-0000-0000-0000-0000000000c1', 'insurance', 'SECRET-POLICY-1', current_date - 10),
  ('00000000-0000-0000-0000-0000000000c1', 'id', 'SECRET-ID-1', null),
  ('00000000-0000-0000-0000-0000000000c1', 'dbs', 'SECRET-DBS-1', current_date + 100),
  ('00000000-0000-0000-0000-0000000000c1', 'gas_safe', 'SECRET-GAS-1', current_date + 100);

insert into public.provider_categories (provider_id, category_id)
select '00000000-0000-0000-0000-0000000000c1', id from public.categories where slug in ('plumber', 'gas-boilers');

-- gas check lapses after linking: gas-boilers must disappear from the public view
update public.provider_checks set expires_on = current_date - 1
where provider_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'gas_safe';

insert into auth.users (id) select ('00000000-0000-0000-0000-0000000002' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 3) n;
insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, use_again)
select '00000000-0000-0000-0000-0000000000c1', ('00000000-0000-0000-0000-0000000002' || lpad(n::text, 2, '0'))::uuid,
  (select id from public.categories where slug = 'plumber'), current_date, '250-1k', 'yes', 'yes', 5, 'yes'
from generate_series(1, 3) n;

set local role anon;

select is((select count(*)::int from public.provider_public where slug like 'pv-%'), 2, 'anon sees only live providers');
select is((select count(*)::int from public.provider_public where slug in ('pv-paused', 'pv-invited')), 0, 'paused and invited are hidden');
select is((select is_verified from public.provider_public where slug = 'pv-live'), true, 'is_verified true when verified_at set');
select is((select is_verified from public.provider_public where slug = 'pv-bare'), false, 'is_verified false otherwise');
select is((select has_whatsapp from public.provider_public where slug = 'pv-live'), true, 'has_whatsapp true');
select is((select has_whatsapp from public.provider_public where slug = 'pv-bare'), false, 'has_whatsapp false');
select is((select category_slugs from public.provider_public where slug = 'pv-live'), array['plumber'], 'lapsed gas-boilers category is hidden');
select is((select jsonb_array_length(checks) from public.provider_public where slug = 'pv-live'), 2, 'expired checks excluded (insurance and gas_safe)');
select is((select checks::text like '%SECRET%' or checks::text like '%reference%' or checks::text like '%document_path%' from public.provider_public where slug = 'pv-live'), false, 'checks never contain reference or document_path');
select is((select checks from public.provider_public where slug = 'pv-bare'), '[]'::jsonb, 'checks is [] when none');
select is((select review_count from public.provider_public where slug = 'pv-live'), 3, 'stats flow through the view');

select throws_ok($$select phone_e164 from public.providers$$, '42501', null, 'anon cannot read providers.phone_e164');
select throws_ok($$select * from public.provider_checks$$, '42501', null, 'anon cannot read provider_checks');
select throws_ok($$insert into public.providers (slug, business_name, phone_e164) values ('x', 'x', '+447700900999')$$, '42501', null, 'anon cannot insert providers');
select throws_ok($$select * from public.provider_stats('00000000-0000-0000-0000-0000000000c1')$$, '42501', null, 'anon cannot execute provider_stats');

reset role;

set local role service_role;
select lives_ok($$select slug from public.provider_public$$, 'service_role can select from provider_public');
reset role;

select * from finish();
rollback;
