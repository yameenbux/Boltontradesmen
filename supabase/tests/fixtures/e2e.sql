-- E2E fixture: loaded by scripts/e2e-prepare.sh (the Playwright webServer command) after `npm run db:reset`, as postgres.
-- Not named *.test.sql so pg_prove ignores it.

insert into public.providers (id, slug, business_name, contact_name, phone_e164, whatsapp_e164, areas, bio, status, consent_at, consent_evidence, verified_at) values
  ('00000000-0000-0000-0000-00000000e201', 'e2e-ace-plumbing', 'Ace Plumbing', 'Alan Ace', '+447700900301', '+447700900301',
    array['BL1','BL3','BL4'], 'Boilers, leaks and bathrooms across Bolton.', 'live', now(), '{"source":"e2e"}'::jsonb, now()),
  ('00000000-0000-0000-0000-00000000e202', 'e2e-fresh-pipes', 'Fresh Pipes', 'Fran Fresh', '+447700900302', null,
    array['BL5','BL6'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null),
  ('00000000-0000-0000-0000-00000000e203', 'e2e-half-way', 'Half Way Plumbing', null, '+447700900303', null,
    array['BL3'], null, 'live', now(), '{"source":"e2e"}'::jsonb, null);

insert into public.provider_categories (provider_id, category_id)
select p.id, c.id
from public.providers p cross join public.categories c
where p.slug like 'e2e-%' and c.slug = 'plumber';

insert into public.provider_checks (provider_id, kind, reference, expires_on, checked_at) values
  ('00000000-0000-0000-0000-00000000e201', 'id', 'E2E-ID', null, '2026-10-03'),
  ('00000000-0000-0000-0000-00000000e201', 'insurance', 'E2E-POLICY', '2099-03-31', '2026-10-03');

insert into auth.users (id)
select ('00000000-0000-0000-0000-00000000e3' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 4) n
on conflict (id) do nothing; -- the local-stack db:reset does not clear auth.users

-- Ace Plumbing: 4 reviews. Half Way: 2 reviews. Fresh Pipes: none.
insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, use_again)
select '00000000-0000-0000-0000-00000000e201', ('00000000-0000-0000-0000-00000000e3' || lpad(n::text, 2, '0'))::uuid,
  (select id from public.categories where slug = 'plumber'), date_trunc('month', current_date)::date, '250-1k', 'yes', 'yes', 5, 'yes'
from generate_series(1, 4) n;

insert into public.reviews (provider_id, reviewer_id, category_id, job_month, value_band, on_time, on_price, quality, use_again)
select '00000000-0000-0000-0000-00000000e203', ('00000000-0000-0000-0000-00000000e3' || lpad(n::text, 2, '0'))::uuid,
  (select id from public.categories where slug = 'plumber'), date_trunc('month', current_date)::date, '<250', 'yes', 'yes', 4, 'yes'
from generate_series(1, 2) n;

-- Every E2E sign-in comes from 127.0.0.1, so raise the per-IP (and per-number) OTP limits.
update public.settings set value = '{"number_15m":50,"number_24h":200,"ip_1h":1000,"ip_24h":5000}'::jsonb where key = 'otp_limits';
