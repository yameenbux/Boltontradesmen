# Bolton Vouched — Plan 1: Foundation, Public Directory & Provider Consent

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable Next.js + Supabase app where the admin can add providers, collect their consent via a link, publish them, and residents can browse categories and profiles and tap to call/WhatsApp (with taps recorded as enquiries).

**Architecture:** Next.js App Router renders public pages on the server from a Postgres view (`provider_public`) that has no phone or billing columns. All writes go through `SECURITY DEFINER` Postgres functions called from server actions/route handlers; browsers have no direct table write access. Ratings are computed in SQL so later plans (reviews) only add rows.

**Tech Stack:** Node 22, Next.js 16 (App Router, TypeScript strict), Tailwind CSS, `@supabase/supabase-js` 2.x + `@supabase/ssr` 0.12.x, Supabase CLI (local stack via Docker) with pgTAP, Zod 4, `libphonenumber-js`, Vitest 5, Playwright 1.64, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-11-bolton-vouched-design.md` (§2, §3, §4 items 1–3, §5 onboarding, §6). Later plans: 2 reviews & resident auth · 3 community feed · 4 provider accounts & payments · 5 complaints, moderation & monitoring.

## Global Constraints

- Product name in all UI copy: **Bolton Vouched**. Code term: **provider** (never "trader").
- Phone numbers are never rendered in HTML and never selectable through `provider_public`.
- `provider_public` must not expose any billing column, phone column, check `reference` or `document_path`.
- A provider can be `live` only if `consent_at IS NOT NULL` (DB check constraint).
- Max 3 categories per provider (DB trigger).
- Categories with `requirement` `gas_safe` / `dvsa_adi` need an in-date matching `provider_checks` row; otherwise the provider does not appear in that category.
- Score: `m = 3`, weight `0.5 ^ (age_months / 24)`, no score shown below 3 reviews; reviews with status `published` or `under_check` count.
- Enquiry = `call_tap`/`whatsapp_tap`, max one per (provider, actor-or-device, calendar day, Europe/London), excluding the provider's own account and admins.
- Supabase region London; timezone for day boundaries `Europe/London`.
- Contact redirect always proceeds even if event logging fails.
- Every admin write inserts an `audit_log` row.

## Review Focus

1. **Admin types phone numbers in local formats** ("07700 900123", "+44 7700 900 123", "7700900123") → stored as E.164 `+447700900123`; non-UK or invalid numbers rejected with a message. Test in Task 7.
2. **Two providers with the same or punctuated business name** ("Dave's Bouncy Castles" twice) → unique, URL-safe slugs (`daves-bouncy-castles`, `daves-bouncy-castles-2`). Test in Task 7.
3. **Provider without a WhatsApp number** → no WhatsApp button; `/api/contact/[slug]?via=whatsapp` returns 404, not a broken `wa.me` link. Test in Task 5.
4. **Consent link reused, or used after the provider was removed** → clear "This link is no longer valid" page, no state change. Test in Task 8.
5. **Gas Safe check expires after a provider is live** → provider silently drops out of the Gas & boilers category but stays listed in their other categories. Test in Task 3.

---

## File Structure

```
app/
  layout.tsx                      root layout, header/footer, metadata
  page.tsx                        home: search, category groups grid, district filter
  manifest.ts                     PWA manifest
  c/[category]/page.tsx           category list (ranked + "New on Bolton Vouched")
  p/[slug]/page.tsx               provider profile
  api/contact/[slug]/route.ts     log tap + redirect
  consent/[token]/page.tsx        consent page
  consent/[token]/actions.ts      acceptConsent server action
  admin/login/page.tsx            admin email+password sign-in
  admin/layout.tsx                admin guard
  admin/page.tsx                  admin home (providers list for now)
  admin/providers/new/page.tsx
  admin/providers/[id]/page.tsx   edit, checks, consent link, status
  admin/providers/actions.ts      server actions wrapping admin RPCs
  privacy/page.tsx, terms/page.tsx, how-ratings-work/page.tsx
components/
  ProviderCard.tsx  StatsBlock.tsx  ChecksRow.tsx  ContactButtons.tsx  DistrictFilter.tsx
lib/
  supabase/server.ts  supabase/service.ts
  directory.ts        read queries over provider_public
  phone.ts            toE164
  slug.ts             slugify
  device-hash.ts      deviceHash
  districts.ts        BL district list
  checks.ts           checksSummaryText
supabase/
  config.toml
  migrations/
    20261011000001_core.sql
    20261011000002_reviews_scoring.sql
    20261011000003_public_view_rls.sql
    20261011000004_contact_events.sql
    20261011000005_admin_consent.sql
  seed.sql
  tests/*.test.sql                pgTAP
tests/unit/*.test.ts              Vitest
e2e/*.spec.ts                     Playwright
.github/workflows/ci.yml
.env.example
```

---

### Task 1: Scaffold, tooling and CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `vitest.config.ts`, `playwright.config.ts`, `tests/unit/smoke.test.ts`, `e2e/smoke.spec.ts`, `.github/workflows/ci.yml`, `.env.example`, `README.md`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`), `test` (vitest run), `test:db` (`supabase test db`), `test:e2e` (playwright). Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEVICE_HASH_SECRET`, `NEXT_PUBLIC_SITE_URL`.

- [ ] **Step 1:** `npx create-next-app@16 . --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*"`; add devDeps `vitest@5`, `@playwright/test@1.64`, `supabase` (CLI); deps `@supabase/supabase-js@2`, `@supabase/ssr@0.12`, `zod@4`, `libphonenumber-js`. Set `"strict": true`.
- [ ] **Step 2: Write smoke tests.** `tests/unit/smoke.test.ts`: `expect(1+1).toBe(2)`. `e2e/smoke.spec.ts`: visiting `/` shows heading text `Bolton Vouched`.
- [ ] **Step 3:** Home page renders `<h1>Bolton Vouched</h1>` and tagline `Local people, vouched for by Bolton.`
- [ ] **Step 4: Verify.** `npm run lint && npm run typecheck && npm test && npm run test:e2e` → all pass.
- [ ] **Step 5:** CI workflow on `pull_request` and `push` to `main`: install, lint, typecheck, unit; job 2 starts Supabase (`supabase start`), runs `supabase test db`, builds and runs Playwright against `next start`.
- [ ] **Step 6:** README: what it is, `.env.example` keys, `npm run dev`, `npx supabase start`. Commit `chore: scaffold Next.js app with test tooling and CI`.

---

### Task 2: Core schema — categories, providers, checks, admin

**Files:**
- Create: `supabase/config.toml` (via `npx supabase init`), `supabase/migrations/20261011000001_core.sql`, `supabase/seed.sql`, `supabase/tests/core.test.sql`

**Interfaces:**
- Produces tables (spec §3): `category_groups(id, name, slug, sort, asks_tidy)`, `categories(id, group_id, slug, name, requirement, guidance_note, active)`, `providers(id, slug unique, business_name, contact_name, phone_e164, whatsapp_e164, areas text[], bio, user_id, status, consent_at, consent_evidence jsonb, consent_token uuid unique, consent_token_used_at, verified_at, created_at, updated_at)`, `provider_categories(provider_id, category_id, pk both)`, `provider_checks(id, provider_id, kind, reference, expires_on, checked_at, checked_by, document_path)`, `profiles(user_id pk → auth.users, role, display_name, postcode_district, created_at, blocked_at)`, `settings(key pk, value jsonb)`, `audit_log(id, actor_id, action, target_type, target_id, reason, created_at)`.
- Enums: `provider_status` (`invited`,`consented`,`live`,`paused`,`removed`), `category_requirement` (`none`,`gas_safe`,`dvsa_adi`), `check_kind` (`id`,`insurance`,`gas_safe`,`dvsa_adi`,`food_hygiene`,`pipa`,`niceic_napit`,`dbs`,`other`), `user_role` (`resident`,`provider`,`admin`).
- Function `is_admin() returns boolean` (true when `auth.uid()` has `profiles.role = 'admin'`).

- [ ] **Step 1: Write failing pgTAP tests** in `core.test.sql`:
  - `throws_ok` updating a provider to `status='live'` with `consent_at` null (check constraint `providers_live_requires_consent`).
  - `throws_ok` inserting a 4th `provider_categories` row for one provider (message `max 3 categories`).
  - `throws_ok` linking a provider to the `gas-boilers` category without an in-date `gas_safe` check (message `category requires gas_safe check`); `lives_ok` after inserting a check with `expires_on = current_date + 30`.
  - `is(count(*) from category_groups, 6)`; `ok(count(*) from categories >= 38)`; `gas-boilers` has requirement `gas_safe`; `driving-instructors` has `dvsa_adi`; `electrician.guidance_note` equals `For rewires and new circuits, look for an NICEIC/NAPIT tick or ask about building control sign-off.`
  - `asks_tidy` true exactly for slugs `home-trades` and `moving-waste`.
  - `settings` row `enquiry_threshold` = `5`.
- [ ] **Step 2:** `npx supabase start && npx supabase test db` → FAIL (relations missing).
- [ ] **Step 3: Write the migration** with the tables above, the constraint, the triggers `enforce_max_categories` and `enforce_category_requirement` (BEFORE INSERT on `provider_categories`), `updated_at` trigger, and `is_admin()`. Enable RLS on every table with **no** policies yet (deny all). Seed in `seed.sql`: 6 groups and the categories from spec §6 (at least the examples listed there, ~40 total), plus `settings`: `enquiry_threshold=5`, `group_code="BOLTON"`.
- [ ] **Step 4:** `npx supabase db reset && npx supabase test db` → PASS.
- [ ] **Step 5:** Commit `feat(db): core schema for categories, providers and checks`.

---

### Task 3: Reviews table and scoring

Reviews have no write path until Plan 2, but the table and score live here so `provider_public` is final.

**Files:**
- Create: `supabase/migrations/20261011000002_reviews_scoring.sql`, `supabase/tests/scoring.test.sql`

**Interfaces:**
- Consumes: `providers`, `categories` (Task 2).
- Produces: table `reviews` exactly as spec §3 (enums `review_status`, `on_time_answer`, `on_price_answer`, `use_again_answer`, `value_band`; unique partial index `one_live_review_per_reviewer` on `(provider_id, reviewer_id) where status <> 'removed'`). Function `provider_stats(p_provider uuid) returns table(review_count int, use_again_pct int, on_time_pct int, on_price_pct int, tidy_pct int, score numeric)`. Functions `register_mean_quality() returns numeric` and `weighted_mean_quality(p_provider uuid) returns numeric` (R). Function `category_visible(p_provider uuid, p_category uuid) returns boolean` (false when the category has a requirement and no in-date matching check).

- [ ] **Step 1: Write failing pgTAP tests** using fixture reviews inserted as superuser (dates relative to `now()`):
  - Provider A with 2 reviews → `score IS NULL`, `review_count = 2`.
  - Register of: provider A 4 reviews quality 5 (age 0), provider B 4 reviews quality 3 (age 0) → `register_mean_quality() = 4.0`; A score = `(4/7)*5 + (3/7)*4 = 4.571…` (assert `round(score,2) = 4.57`); B score `3.43`.
  - Recency: provider C reviews quality 5 at age 24 months and quality 1 at age 0 plus a third quality 3 at age 0 → `weighted_mean_quality(C) = 2.6` (`(0.5*5 + 1*1 + 1*3)/(0.5+1+1)`).
  - `use_again_pct`: 3 yes / 1 maybe → `75`. `tidy_pct` NULL when all tidy values NULL.
  - Reviews with status `removed` or `under_notice` excluded; `under_check` included.
  - **Review Focus 5:** provider D in `gas-boilers` and `handyman`, Gas Safe check updated to `expires_on = current_date - 1` → `category_visible(D, gas-boilers) = false`, `category_visible(D, handyman) = true`.
- [ ] **Step 2:** `npx supabase test db` → FAIL.
- [ ] **Step 3: Implement.** Age in months = `extract(epoch from now() - job_month::timestamptz) / (86400 * 30.4375)`. Score SQL core:

```sql
-- R: recency-weighted mean; v: count; C: register mean; m = 3
select case when v < 3 then null
            else (v::numeric/(v+3))*r + (3::numeric/(v+3))*c end
```

  Percentages are `round(100.0 * yes / answered)`; NULL when nothing answered.
- [ ] **Step 4:** `npx supabase test db` → PASS.
- [ ] **Step 5:** Commit `feat(db): reviews table and shrunk scoring`.

---

### Task 4: Public view and row-level security

**Files:**
- Create: `supabase/migrations/20261011000003_public_view_rls.sql`, `supabase/tests/public_view.test.sql`

**Interfaces:**
- Consumes: Task 2–3 tables and functions.
- Produces: view `provider_public` (security barrier, owned by a role that bypasses RLS, `grant select to anon, authenticated`) with columns exactly: `id, slug, business_name, contact_name, areas, bio, is_verified, has_whatsapp, category_slugs text[]` (visible categories only), `checks jsonb` (array of `{kind, expires_on, checked_at}` for in-date checks), `review_count, use_again_pct, on_time_pct, on_price_pct, tidy_pct, score, last_review_at, created_at`. Rows: `status = 'live'` only. Public select policies on `categories` and `category_groups` (active only).

- [ ] **Step 1: Write failing pgTAP tests:**
  - `columns_are('public','provider_public', ARRAY[...exact list above...])` — this is the guard that fails the build if a phone or billing column is ever added.
  - As `anon` (`set local role anon`): `select count(*) from provider_public` returns only `live` providers; `throws_ok` on `select phone_e164 from providers`; `throws_ok` on `select * from provider_checks`; `throws_ok` on any `insert` into `providers`.
  - `checks` for a provider excludes an expired insurance check and never contains `reference`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** `npx supabase test db` → PASS.
- [ ] **Step 5:** Commit `feat(db): provider_public view and RLS lockdown`.

---

### Task 5: Contact events, enquiry counting and the contact redirect

**Files:**
- Create: `supabase/migrations/20261011000004_contact_events.sql`, `supabase/tests/enquiries.test.sql`, `lib/device-hash.ts`, `lib/supabase/service.ts`, `app/api/contact/[slug]/route.ts`, `tests/unit/device-hash.test.ts`, `tests/unit/contact-route.test.ts`

**Interfaces:**
- Produces: table `contact_events(id, provider_id, type contact_type, actor_id uuid null, device_hash text, created_at)`; function `log_contact(p_slug text, p_type contact_type, p_actor uuid, p_device_hash text) returns table(phone_e164 text, whatsapp_e164 text)` (`SECURITY DEFINER`, executable by `service_role` only, returns NULL row for non-live/unknown slug); function `enquiry_count(p_provider uuid) returns int`.
- `deviceHash(ip: string, userAgent: string): string` — HMAC-SHA256 hex with `DEVICE_HASH_SECRET`.
- `createServiceClient(): SupabaseClient` — server-only, service role key.
- Route `GET /api/contact/[slug]?via=call|whatsapp` → 302 to `tel:+44…` or `https://wa.me/44…`; 404 for unknown/non-live slug or missing WhatsApp; 400 for other `via`.

- [ ] **Step 1: Write failing pgTAP tests** for `enquiry_count`:
  - Same device taps call 3× today → `1`; plus whatsapp tap same device today → still `1`.
  - Same device yesterday and today → `2` (day boundary in `Europe/London`).
  - Two devices today → `2`.
  - Tap by actor equal to `providers.user_id` → not counted; tap by an admin actor → not counted.
  - `profile_view` rows → not counted.
- [ ] **Step 2: Write failing Vitest tests:** `deviceHash` is deterministic, 64 hex chars, differs when IP differs. Route tests (mock `createServiceClient`): `via=call` → 302 `tel:+447700900123`; `via=whatsapp` with `whatsapp_e164` null → 404 (**Review Focus 3**); unknown slug → 404; when `log_contact` throws but phone lookup succeeds via fallback select → still 302.
- [ ] **Step 3:** Run both suites → FAIL.
- [ ] **Step 4: Implement.** Dedupe rule SQL:

```sql
select count(*) from (
  select distinct coalesce(e.actor_id::text, e.device_hash),
         (e.created_at at time zone 'Europe/London')::date
  from contact_events e
  join providers p on p.id = e.provider_id
  where e.provider_id = p_provider
    and e.type in ('call_tap','whatsapp_tap')
    and (e.actor_id is null or (e.actor_id is distinct from p.user_id
         and not exists (select 1 from profiles a where a.user_id = e.actor_id and a.role = 'admin')))
) t;
```

  Route: on logging failure, catch, report to `console.error`, and fall back to a service-role select of the phone so the redirect still happens.
- [ ] **Step 5:** Both suites PASS. Commit `feat: contact redirect with enquiry logging and dedupe`.

---

### Task 6: Public pages — home, category list, provider profile

**Files:**
- Create: `lib/supabase/server.ts`, `lib/directory.ts`, `lib/districts.ts`, `lib/checks.ts`, `components/ProviderCard.tsx`, `components/StatsBlock.tsx`, `components/ChecksRow.tsx`, `components/ContactButtons.tsx`, `components/DistrictFilter.tsx`, `app/page.tsx` (replace), `app/c/[category]/page.tsx`, `app/p/[slug]/page.tsx`, `app/manifest.ts`, `tests/unit/directory.test.ts`, `tests/unit/checks.test.ts`, `e2e/directory.spec.ts`

**Interfaces:**
- Consumes: `provider_public`, `categories`, `category_groups`.
- Produces:
  - `type PublicProvider` mirroring `provider_public` columns (camelCase).
  - `listCategoryGroups(): Promise<{group: Group; categories: Category[]}[]>`
  - `listProvidersInCategory(categorySlug: string, district?: string): Promise<{ranked: PublicProvider[]; newcomers: PublicProvider[]}>` — ranked = `score not null` sorted score desc, review_count desc, last_review_at desc; newcomers = `review_count < 3` sorted created_at desc. District filter matches `areas @> {district}`.
  - `getProvider(slug: string): Promise<PublicProvider | null>`
  - `BL_DISTRICTS: readonly string[]` = `BL1`–`BL7` plus `M26`, `M28`, `M46`, `WN2`.
  - `checksSummaryText(checks): string` e.g. `✓ ID checked Oct 2026 · ✓ Insured to Mar 2027 · Accreditations: none provided`.
  - Pages revalidate every 300 s (`export const revalidate = 300`).

- [ ] **Step 1: Write failing unit tests:** `listProvidersInCategory` splits/sorts a mocked result set as specified (including tie-break on review count then recency); `checksSummaryText` produces the exact string above for `[{kind:'id',checked_at:'2026-10-03'},{kind:'insurance',expires_on:'2027-03-31'}]` and `No checks yet` for `[]`.
- [ ] **Step 2: Write failing E2E** (`e2e/directory.spec.ts`, using a seeded test provider fixture loaded via `supabase/tests/fixtures/e2e.sql`):
  - Home shows the 6 group names and a link to `/c/plumber`; typing `bouncy` in the `What do you need?` search shows a link to `/c/bouncy-castles` (client-side match on category names, no DB query).
  - `/c/plumber` lists a 4-review provider under the ranked list and a 0-review provider under heading `New on Bolton Vouched`; district filter `BL3` hides a provider not covering BL3.
  - `/p/[slug]` shows `Would use again` %, the Checks row, a `Call` button whose href is `/api/contact/[slug]?via=call`, and **no `+44` or `07` digits anywhere in page HTML**.
  - Provider with < 3 reviews shows `3 reviews needed for a score`.
- [ ] **Step 3:** FAIL. **Step 4:** implement pages and components; Tailwind, mobile-first, 16 px side gutters; category page shows `guidance_note` when present. Manifest: name `Bolton Vouched`, `display: standalone`.
- [ ] **Step 5:** Unit + E2E PASS. Commit `feat: public directory pages`.

---

### Task 7: Admin sign-in and provider management

**Files:**
- Create: `supabase/migrations/20261011000005_admin_consent.sql` (admin part), `supabase/tests/admin.test.sql`, `lib/phone.ts`, `lib/slug.ts`, `tests/unit/phone.test.ts`, `tests/unit/slug.test.ts`, `app/admin/login/page.tsx`, `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/providers/new/page.tsx`, `app/admin/providers/[id]/page.tsx`, `app/admin/providers/actions.ts`, `e2e/admin.spec.ts`

**Interfaces:**
- Produces SQL functions (`SECURITY DEFINER`, each raises `not admin` unless `is_admin()`, each writes `audit_log`):
  - `admin_upsert_provider(p jsonb) returns uuid` — fields: id?, business_name, contact_name, phone_e164, whatsapp_e164, areas, bio, category_ids uuid[]. Generates slug on insert via `unique_slug(text)`.
  - `admin_set_provider_status(p_id uuid, p_status provider_status, p_reason text) returns void`
  - `admin_record_check(p_provider uuid, p_kind check_kind, p_reference text, p_expires_on date) returns uuid`
  - `admin_new_consent_token(p_provider uuid) returns uuid` — rotates token, clears `consent_token_used_at`.
- `toE164(input: string): string` — throws `InvalidPhoneError` unless a valid GB mobile/landline.
- `slugify(name: string): string`.
- Admin auth: Supabase email + password; admin user created manually and given `profiles.role = 'admin'` (document in README). Public sign-ups disabled in `config.toml`.

- [ ] **Step 1: Write failing unit tests (Review Focus 1 & 2):**
  - `toE164('07700 900123')`, `toE164('+44 7700 900 123')`, `toE164('447700900123')` → `+447700900123`; `toE164('+1 415 555 0100')` and `toE164('12345')` throw `InvalidPhoneError`.
  - `slugify("Dave's Bouncy Castles!")` → `daves-bouncy-castles`; `slugify('  Ánna  Hair ')` → `anna-hair`.
- [ ] **Step 2: Write failing pgTAP tests:** non-admin calling `admin_upsert_provider` → `throws_ok 'not admin'`; admin creates two providers named `Dave's Bouncy Castles` → slugs `daves-bouncy-castles` and `daves-bouncy-castles-2`; each admin function inserts one `audit_log` row with matching `action`; `admin_set_provider_status(id,'live',…)` on an `invited` provider → throws (consent constraint).
- [ ] **Step 3:** FAIL. **Step 4:** implement SQL, libs, pages (server actions validate with Zod, call `toE164`, show field errors inline). Admin layout redirects non-admins to `/admin/login`.
- [ ] **Step 5: E2E:** admin logs in, creates a provider with phone `07700 900123` in `plumber`, sees status `invited` and a `Copy consent link` button. PASS.
- [ ] **Step 6:** Commit `feat(admin): provider management with audit log`.

---

### Task 8: Consent flow and going live

**Files:**
- Modify: `supabase/migrations/20261011000005_admin_consent.sql` (consent part), `supabase/tests/admin.test.sql`
- Create: `app/consent/[token]/page.tsx`, `app/consent/[token]/actions.ts`, `lib/consent-text.ts`, `e2e/consent.spec.ts`

**Interfaces:**
- Produces `accept_consent(p_token uuid, p_ip text, p_text_version text) returns text` (`SECURITY DEFINER`, executable by `service_role`): returns `'ok'` and sets `status='consented'`, `consent_at=now()`, `consent_evidence={ip, text_version, accepted_at}`, `consent_token_used_at=now()` only when the token matches, is unused, and status is `invited`; otherwise returns `'invalid'` with no change.
- `CONSENT_TEXT_VERSION = '2026-10-11'` and `CONSENT_TEXT` in `lib/consent-text.ts` — the statement from spec §5 adapted to "Bolton Vouched": listing name, categories, areas and a contact button; reviews are published without approval and not removed because the provider disagrees; withdraw any time, removed within one working day, reviews hidden with the profile and restored on re-listing; link to `/privacy`; controller line `Bolton Vouched is run by [OWNER LEGAL NAME]. Contact: [CONTACT EMAIL].` (placeholders rendered from env `OWNER_LEGAL_NAME`, `CONTACT_EMAIL`).

- [ ] **Step 1: Write failing pgTAP tests (Review Focus 4):** valid token → `'ok'` and status `consented`; same token again → `'invalid'`, `consent_at` unchanged; token for a provider set to `removed` → `'invalid'`; rotated token makes the old one `'invalid'`; after consent, `admin_set_provider_status(id,'live',…)` succeeds and the provider appears in `provider_public`.
- [ ] **Step 2: Write failing E2E:** open `/consent/<token>` → page shows the business name, categories, areas and the full `CONSENT_TEXT`; click `I agree` → `Thanks — you're all set`; reopening the link shows `This link is no longer valid`.
- [ ] **Step 3:** FAIL. **Step 4:** implement; action reads IP from `x-forwarded-for`. Admin provider page gains `Set live` (enabled only when `consented`), `Pause`, `Remove` (reason required), and `New consent link`.
- [ ] **Step 5:** PASS. Commit `feat: provider consent link and go-live`.

---

### Task 9: Policy pages and deploy readiness

**Files:**
- Create: `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/how-ratings-work/page.tsx`, `e2e/policies.spec.ts`
- Modify: `app/layout.tsx` (footer links), `README.md` (deploy section)

**Interfaces:** none new.

- [ ] **Step 1: Write failing E2E:** footer on every page links to `/privacy`, `/terms`, `/how-ratings-work`; each page returns 200 with an `<h1>`.
- [ ] **Step 2:** FAIL. **Step 3:** write pages. Privacy notice covers: controller identity (env placeholders), what is collected (providers: listing data and consent evidence; visitors: hashed device signature for contact taps), lawful bases, UK storage (Supabase London), retention, rights, ICO complaint route. How-ratings-work explains the four headline figures, shrinkage in plain words, the 3-review minimum and "payment never affects ranking". Each policy page carries a visible draft banner `Draft — pending legal review` until removed by the owner.
- [ ] **Step 4:** PASS. **Step 5:** README deploy section: create Supabase project (London), `supabase link` + `supabase db push`, create admin user and set role, Vercel env vars, disable Supabase sign-ups.
- [ ] **Step 6:** Full suite: `npm run lint && npm run typecheck && npm test && npm run test:db && npm run test:e2e` → all PASS. Commit `feat: policy pages and deploy docs`.

---

## Done when

The admin can add the 20 seed providers, send each a consent link, set them live, and a resident on a phone can browse categories, see profiles with stats and checks, and tap Call/WhatsApp — with every tap counted by `enquiry_count` — and the full test suite passes in CI.
