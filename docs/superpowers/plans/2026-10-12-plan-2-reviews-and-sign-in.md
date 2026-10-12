# Bolton Vouched — Plan 2: Phone Sign-in, Reviews, Replies & Moderation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Residents and providers sign in with a UK mobile number, residents post structured reviews (with optional private proof) that go live at once under the spec's anti-fake rules, providers reply to their reviews, the public profile shows reviews and the ranked list switches on, and the admin works a review/flag/proof queue — with every "coming soon" claim this makes true rewritten.

**Architecture:** Supabase Auth phone OTP (Twilio Verify in production, Supabase test OTPs locally and in CI) behind a server-side gate that validates the number, rate-limits by number and IP, and rejects VoIP lines via Twilio Lookup *before* any code is sent; a trigger on `auth.users` refuses any new account the gate did not approve, so the gate cannot be bypassed with the public anon key. Every review write is a `SECURITY DEFINER` function that enforces the posting rules and runs the auto-flag rules in the same transaction. Public pages stay static and cookie-free: reviews are read through a second barrier view, `review_public`, and only the new signed-in routes read the session cookie.

**Tech Stack:** as Plan 1 (Next.js 16.4 App Router, Supabase JS 2 + `@supabase/ssr` 0.12, Zod 4, `libphonenumber-js`, Vitest 5, Playwright 1.64, pgTAP) plus `sharp` 0.35 (already in the tree via Next; add as a direct dependency) for metadata stripping. Twilio is called with `fetch` (no SDK).

**Spec:** `docs/superpowers/specs/2026-10-11-bolton-vouched-design.md` (§1 rules 3–4, §3 profiles/reviews/review_proofs/review_responses/flags/phone_retention, §4 items 3–5 and 9, §5 "Login and activation" and Reply, §7 Signup / Posting / Auto-flag rows, §8 SMS + uploads, §9). Also `docs/superpowers/plans/plan-1-followups.md` ("Fix early in Plan 2" is Task 1). Later plans, **not** planned here: 3 community questions feed · 4 provider dashboard, enquiry stats, upgrade prompt after 5 enquiries, Stripe Verified tier (£10/month or £100/year), document upload, Verified-only filter, lapses, webhooks, reconciliation · 5 complaints (Defamation Regs 2013), admin home priority queue, monitoring/alerts, backups.

**House facts the spec predates:** hosting is Railway (not Vercel); the directory lives under `/platform` (`lib/paths.ts`); policy pages live in `app/(info)/`; migrations reach production by pasting each file into the Supabase SQL editor in filename order (README → Deploying).

## Global Constraints

- UI copy says **Bolton Vouched**; code says **provider**. British English; dates day-month-year in `Europe/London`.
- Sign-in: **UK +44 mobile numbers only**, validated server-side; VoIP/virtual numbers rejected with a plain-English message; one account per number; OTP rate limits per number and per IP; hard monthly SMS spend cap (`settings.sms_monthly_cap_gbp`).
- Lookup failure (error, timeout, missing credentials) **fails closed**: no code is sent; the person sees a retry message. SMS failures show a retry message, never a raw error.
- Admin keeps email + password sign-in. New email-only accounts are refused unless the email is in `settings.admin_emails`.
- Review fields exactly as spec §3: `value_band` `<250` / `250-1k` / `1k-5k` / `5k+`; `on_time` `yes` / `late_informed` / `no`; `on_price` `yes` / `slightly_over_explained` / `significantly_over`; `quality` 1–5; `tidy` only when the category's group has `asks_tidy`; `use_again` `yes` / `maybe` / `no`; `comment` ≤ 400 characters.
- Prompt above submit, verbatim: **"Be honest — mixed jobs are useful too."** Results, verbatim: **"Published"** or **"Published, under a quick check"**. Proof note verbatim: **"only the admin sees this"**.
- Reviews and replies are editable by their author for **14 days**; edits re-run the checks.
- Every posted review has a phone-verified person behind it. Reviews are removed only for cause with a mandatory, non-blank, logged reason, and are **never hard-deleted** (DB trigger).
- Statuses that count toward scores and show publicly: `published` and `under_check` (with an "under check" label). `under_notice` and `removed` neither count nor show.
- Money never moves a rating: no ranking input other than review data.
- Phone numbers never appear in public HTML — including inside review comments (comments containing a phone number are refused).
- Proofs: JPEG, PNG, WebP or PDF only, ≤ 10 MB (`10 * 1024 * 1024` bytes), private bucket `review-proofs`, image metadata (EXIF/GPS) stripped server-side before storage.
- Public pages (`/platform`, `/platform/c/*`, `/platform/p/[slug]`, policy pages) never call `cookies()`/`headers()` and stay ISR (`revalidate = 300`); only the new signed-in routes are dynamic.
- Every new `SECURITY DEFINER` function: `set search_path = ''`, `revoke execute … from public, anon, authenticated`, then grant only the role that needs it. `admin_*` functions raise `not admin` unless `is_admin()` and write one `audit_log` row per write.
- Next.js 16: `proxy.ts` (not middleware); `revalidatePath(path, 'page')` for dynamic segments; `cookies()` is async and writable only in server actions/route handlers; verify auth inside every server action (proxy coverage is not authorisation).
- Any wording change to the consent statement bumps `CONSENT_TEXT_VERSION`.

## Review Focus

1. **Residents type their mobile every way** ("07700 900401", "+44 7700 900401", "447700900401", "07700-900-401") → all become `+447700900401`; a landline ("01204 123456") or foreign number gets "Enter a UK mobile number, like 07700 900123." before any Lookup or SMS. Test in Task 2.
2. **A comment that contains a phone number or a number split with spaces** ("ring him on 07700 900 123") → refused with "Please leave phone numbers out of your review." by the database, so no path can publish digits. Test in Task 6.
3. **Double-tap on Submit (or two tabs)** → the second insert hits `one_live_review_per_reviewer`; the person sees "You've already reviewed this provider. You can edit your review instead." — never a 500. Test in Task 6 (SQL) and Task 9 (action).
4. **An iPhone photo** (HEIC, or a 12 MB JPEG, or a JPEG carrying GPS EXIF) → HEIC and oversize get a plain message; the JPEG is stored with no EXIF/GPS. The file input's `accept` list makes iOS convert HEIC to JPEG on pick. Test in Task 10.
5. **A crafted `next` parameter** on sign-in (`//evil.example`, `https://evil.example`, `/admin`, `/\evil`) → the person lands on `/platform/account`, never off-site or on admin. Test in Task 2 (unit) and Task 5 (E2E).

---

## File Structure

```
supabase/migrations/
  20261012000002_plan1_followups.sql     removed-is-final, re-invite, consent TTL, review delete guard, whatsapp tap
  20261012000003_phone_accounts.sql      profiles columns, otp_requests, otp_gate/otp_record, auth.users guard, onboarding, provider linking
  20261012000004_review_posting.sql      review_proofs, review_responses, flags tables; submit/edit/context/my_reviews
  20261012000005_review_flags.sql        auto-flag rules, report_review
  20261012000006_review_public.sql       review_public view; provider_public.verified_job_count
  20261012000007_review_proofs.sql       private bucket, add_review_proof
  20261012000008_admin_moderation.sql    admin review/flag/proof/reply functions
  20261012000009_provider_replies.sql    provider_my_reviews, provider_reply
  20261012000010_account_deletion.sql    phone_retention, delete_my_account
supabase/tests/  followups / accounts / reviews_write / review_flags / admin_reviews / replies / account_deletion .test.sql
supabase/tests/fixtures/e2e.sql          + review-target providers, reviewer profiles, an under-check review, raised OTP limits
supabase/config.toml                     phone sign-up on, dummy Twilio, test OTPs
scripts/local-stack/start.sh, README.md  GoTrue phone + test OTP env
scripts/db-reset.sh                      also drops schema private
scripts/e2e-prepare.sh                   allow-lists the E2E admin email
lib/
  phone.ts (+toUkMobileE164)  line-type.ts  otp-gate.ts  ip-hash.ts  safe-next.ts  bots.ts
  display-name.ts  auth.ts  revalidate-public.ts  reviews.ts  review-form.ts  review-draft.ts  proofs.ts
  consent-text.ts (version bump)
app/platform/
  sign-in/{page,actions}.tsx|ts          welcome/{page,actions}       account/{page,actions}
  p/[slug]/page.tsx (reviews section)    p/[slug]/review/{page,actions}
  report/[reviewId]/{page,actions}       provider/{page,actions}
app/admin/(protected)/
  reviews/{page,actions}  flags/page.tsx  proofs/page.tsx  layout.tsx (nav)  page.tsx (counts)
app/(info)/review-policy/page.tsx, fake-reviews-policy/page.tsx, privacy, terms, how-ratings-work
app/api/contact/[slug]/route.ts          HEAD + preview bots don't log
components/auth/{SignInForm,WelcomeForm}.tsx
components/review/{ReviewForm,TapChoice}.tsx
components/profile/{ReviewList,ReviewItem}.tsx   components/ProviderCard.tsx   components/BrandBar.tsx   components/SiteFooter.tsx
components/provider/ReplyForm.tsx
proxy.ts  next.config.ts  .env.example  package.json
e2e/helpers/phone.ts  e2e/{sign-in,review,provider,moderation,account,proof}.spec.ts
tests/unit/*.test.ts
```

---

### Task 1: Plan 1 "fix early" follow-ups

**Files:**
- Create: `supabase/migrations/20261012000002_plan1_followups.sql`, `supabase/tests/followups.test.sql`, `lib/bots.ts`, `tests/unit/bots.test.ts`
- Modify: `app/api/contact/[slug]/route.ts`, `tests/unit/contact-route.test.ts`, `app/admin/(protected)/providers/actions.ts`, `app/admin/(protected)/providers/[id]/page.tsx`, `components/admin/ProviderForms.tsx`, `scripts/db-reset.sh`, `e2e/admin.spec.ts`, `e2e/consent.spec.ts`

**Interfaces:**
- Produces:
  - Column `providers.consent_token_expires_at timestamptz not null default now() + interval '14 days'`; backfill existing rows to `now() + interval '14 days'`.
  - Trigger `providers_removed_is_final` (BEFORE UPDATE OF status, function `private.enforce_removed_exit()`): from `removed` only to `invited`, else raise `a removed provider can only return through a new invite`.
  - `public.admin_reinvite_provider(p_id uuid, p_reason text) returns uuid` — only from `removed`; reason required; sets `status='invited'`, `consent_at=null`, `consent_evidence=null`, `user_id=null`, new token + expiry; audit action `reinvite_provider`; returns the token. Granted to `authenticated` like the other `admin_*`.
  - `admin_new_consent_token` also resets the expiry; `admin_get_provider` adds `consent_token_expires_at`.
  - `consent_preview` and `accept_consent` (same signatures as migration 000006/000005) additionally require `consent_token_expires_at > now()`.
  - Constraint `reviews_removed_requires_reason` becomes `status <> 'removed' or nullif(btrim(removal_reason), '') is not null`.
  - Trigger `reviews_never_deleted` (BEFORE DELETE, `private.forbid_review_delete()`): raises `reviews are never deleted`.
  - `log_contact`: a `whatsapp_tap` for a provider with no WhatsApp inserts nothing (still returns the row).
  - `isLinkPreviewBot(userAgent: string): boolean` — true for `WhatsApp`, `facebookexternalhit`, `Facebot`, `Twitterbot`, `Slackbot`, `TelegramBot`, `Discordbot`, `LinkedInBot`, `SkypeUriPreview`, `Googlebot`, `bingbot`, `Applebot` (case-insensitive).
  - Server action `reinviteProvider(_prev: FormState, fd: FormData): Promise<FormState>` (fields `provider_id`, `reason`).

- [ ] **Step 1: Write failing pgTAP tests** (`followups.test.sql`, as superuser with an admin JWT where needed):
  - `removed → paused` and `removed → live` throw `a removed provider can only return through a new invite`; `removed → invited` via `admin_reinvite_provider` succeeds, returns a uuid, clears `consent_at`, writes one `audit_log` row `reinvite_provider`; `admin_reinvite_provider` on a `live` provider throws; blank reason throws.
  - `delete from reviews` throws `reviews are never deleted`; `update reviews set status='removed', removal_reason='  '` throws `23514`.
  - `consent_preview(token)` returns 0 rows and `accept_consent(token, …)` returns `'invalid'` after `update providers set consent_token_expires_at = now() - interval '1 minute'`; a fresh `admin_new_consent_token` makes it valid again with expiry `between now() + interval '13 days 23 hours' and now() + interval '14 days 1 minute'`.
  - `log_contact(slug_without_whatsapp, 'whatsapp_tap', null, 'h')` returns the row and leaves `count(*) from contact_events` unchanged; `call_tap` still inserts.
- [ ] **Step 2: Write failing Vitest tests:** `isLinkPreviewBot('WhatsApp/2.23.20.0')` and `('facebookexternalhit/1.1')` → true; a Chrome Android UA → false. Route: `HEAD /api/contact/x?via=call` → 204 and `rpc` not called; GET with a `WhatsApp/2` UA → 302 to `tel:` via the fallback select, `rpc('log_contact')` not called.
- [ ] **Step 3:** `npm run db:reset && npm run test:db && npm test` → FAIL.
- [ ] **Step 4: Implement** the migration (re-runnable: `create or replace`, `drop trigger if exists`), the route (`export async function HEAD()` returning 204 `no-store`; GET skips `log_contact` for bots and uses the existing direct select), the admin action and a "Re-invite" form (reason textarea) shown only for `removed` providers, and the consent link line "Link expires on 26 October 2026" (`dayMonthYear` from `lib/checks.ts`). `db-reset.sh` adds `drop schema if exists private cascade;` before `drop schema public`.
- [ ] **Step 5: E2E:** in `e2e/admin.spec.ts` a removed provider shows `Re-invite` and, after re-inviting with a reason, status `invited` and `Copy consent link`; in `e2e/consent.spec.ts` the consent page for a token whose expiry was set to the past (fixture SQL via `psql` in the test's `beforeAll`) shows `This link is no longer valid`.
- [ ] **Step 6:** `npm run db:reset && npm run test:db && npm test && npm run test:e2e` → PASS. Commit `fix: plan 1 follow-ups (removed is final, consent TTL, review delete guard, contact logging)`.

---

### Task 2: Phone, line-type and redirect helpers

**Files:**
- Create: `lib/line-type.ts`, `lib/ip-hash.ts`, `lib/safe-next.ts`, `lib/display-name.ts`, `tests/unit/line-type.test.ts`, `tests/unit/safe-next.test.ts`, `tests/unit/display-name.test.ts`, `tests/unit/ip-hash.test.ts`
- Modify: `lib/phone.ts`, `tests/unit/phone.test.ts`, `.env.example`

**Interfaces:**
- Produces:
  - `toUkMobileE164(input: string): string` — `+447[1-9]XXXXXXXX` only; throws `InvalidPhoneError` otherwise.
  - `type LineCheck = { kind: "mobile" | "voip" | "other"; lineType: string } | { kind: "error"; reason: string }`
  - `checkLineType(e164: string, env?: Record<string, string | undefined>, fetchImpl?: typeof fetch): Promise<LineCheck>` — `GET https://lookups.twilio.com/v2/PhoneNumbers/{e164}?Fields=line_type_intelligence`, Basic auth `TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN`, `AbortSignal.timeout(5000)`. `line_type_intelligence.type`: `mobile` → mobile; `fixedVoip`/`nonFixedVoip` → voip; any other type → other; HTTP error, timeout, missing credentials, `error_code` set or no type → error.
  - Stub: when `env.TWILIO_LOOKUP_STUB === "1"` **and** the number is in Ofcom's drama range `+447700900000`–`+447700900999`, no network call: `+447700900666` → voip (`nonFixedVoip`), `+447700900999` → error, any other drama number → mobile. Numbers outside the range always use the real Lookup.
  - `ipHash(ip: string): string` — HMAC-SHA256 hex of `ip\n` + ip with `DEVICE_HASH_SECRET` (throws when unset, like `deviceHash`).
  - `safeNext(raw: string | null | undefined, fallback?: string): string` — default fallback `/platform/account`; accepts only paths matching `^/platform(/[A-Za-z0-9._~%-]+)*/?(\?[^#\\]*)?$`.
  - `formatDisplayName(first: string, surname: string): string` → `"Sarah K."`; throws `InvalidNameError` unless first name is 1–30 letters/spaces/hyphens/apostrophes (Unicode letters) and surname starts with a letter. Capitalises the first letter of each word of the first name and the initial.
  - `.env.example` gains `TWILIO_ACCOUNT_SID=`, `TWILIO_AUTH_TOKEN=`, `TWILIO_LOOKUP_STUB=1` (with a comment: stub only affects 07700 900xxx drama numbers).

- [ ] **Step 1: Write failing tests:**
  - **Review Focus 1:** `toUkMobileE164` maps `"07700 900401"`, `"+44 7700 900401"`, `"447700900401"`, `"07700-900-401"` → `"+447700900401"`; throws `InvalidPhoneError` for `"01204 123456"`, `"+1 415 555 0100"`, `"07000 123456"`, `""`.
  - `checkLineType` with a mocked `fetch`: `{line_type_intelligence:{type:"mobile"}}` → `{kind:"mobile",lineType:"mobile"}`; `nonFixedVoip` and `fixedVoip` → voip; `landline` → other; HTTP 500 → error; fetch rejecting with `TimeoutError` → error; no `TWILIO_ACCOUNT_SID` → error and fetch not called; the request URL is exactly `https://lookups.twilio.com/v2/PhoneNumbers/%2B447911123456?Fields=line_type_intelligence` and carries `Authorization: Basic …`.
  - Stub: `TWILIO_LOOKUP_STUB=1` → `+447700900401` mobile, `+447700900666` voip, `+447700900999` error, all without calling fetch; `+447911123456` still calls fetch.
  - **Review Focus 5:** `safeNext` returns the input for `/platform/p/ace/review` and `/platform/account?x=1`; returns `/platform/account` for `//evil.example`, `https://evil.example`, `/admin`, `/\evil`, `/platform/../admin`, `null`, `""`.
  - `formatDisplayName("sarah", "khan")` → `"Sarah K."`; `("Mary-Jane", "o'neil")` → `"Mary-Jane O."`; `("Zoë", "Ünal")` → `"Zoë Ü."`; throws for `("", "K")`, `("Sarah1", "K")`, `("Sarah", "")`, a 31-letter first name.
  - `ipHash("1.2.3.4")` is 64 hex chars and differs from `deviceHash("1.2.3.4", "")`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: phone, line-type, redirect and display-name helpers`.

---

### Task 3: Accounts schema — OTP gate, auth guard, onboarding, provider linking

**Files:**
- Create: `supabase/migrations/20261012000003_phone_accounts.sql`, `supabase/tests/accounts.test.sql`

**Interfaces:**
- Consumes: `profiles`, `providers`, `settings`, `audit_log` (Plan 1).
- Produces:
  - `profiles` gains `line_type text`, `line_type_checked_at timestamptz`, `group_member_at timestamptz`, `deleted_at timestamptz`; checks `profiles_display_name_format` (`display_name is null or display_name ~ '^[[:alpha:]][[:alpha:] ''-]{0,29} [[:alpha:]]\.$'`) and `profiles_district_format` (`postcode_district is null or postcode_district ~ '^([A-Z]{1,2}[0-9]{1,2}|OTHER)$'`).
  - Table `otp_requests(id bigint identity pk, phone_e164 text not null check (phone_e164 ~ '^\+447[1-9][0-9]{8}$'), ip_hash text not null, outcome text not null default 'pending' check (outcome in ('pending','limited_number','limited_ip','cap_reached','approved','voip','not_mobile','lookup_failed','sent','send_failed')), line_type text, created_at timestamptz not null default now())`; indexes on `(phone_e164, created_at)`, `(ip_hash, created_at)`, `(created_at)`. RLS on, no grants.
  - Settings (inserted by the migration, `on conflict do nothing`): `sms_monthly_cap_gbp = 20`, `sms_cost_per_send_gbp = 0.10`, `admin_emails = []`, `otp_limits = {"number_15m":3,"number_24h":6,"ip_1h":10,"ip_24h":20}`.
  - `public.otp_gate(p_phone text, p_ip_hash text) returns table (request_id bigint, verdict text)` (service_role only). Takes `pg_advisory_xact_lock(hashtext(p_phone))`; deletes `otp_requests` older than 30 days; counts **all** earlier rows for the number (15 min, 24 h) and IP hash (1 h, 24 h) against `otp_limits`; counts this London calendar month's `sent` rows × `sms_cost_per_send_gbp` against `sms_monthly_cap_gbp`. Inserts one row with outcome `pending` or the limiting outcome; `verdict` ∈ `ok`, `number_limited`, `ip_limited`, `cap_reached`.
  - `public.otp_record(p_request_id bigint, p_outcome text, p_line_type text) returns void` (service_role only).
  - Triggers on `auth.users` (function `private.guard_auth_user()`, re-runnable with `drop trigger if exists`): `bv_guard_auth_user_insert` BEFORE INSERT and `bv_guard_auth_user_phone` BEFORE UPDATE OF phone. Rules: if `deleted_at` is set → allow. If `phone` is non-empty: require an `otp_requests` row for `'+' || phone` with outcome `approved` or `sent` in the last 15 minutes, else raise `phone sign-up not approved`; and no other non-deleted `auth.users` row with the same phone, else raise `phone already registered`. Else if `email` is non-empty (insert only): require `lower(email)` in `settings.admin_emails`, else raise `email sign-ups are disabled`. Else allow (test fixtures insert bare ids).
  - `public.my_account() returns jsonb` (authenticated): `null` when the caller has no profile; else `{user_id, display_name, postcode_district, group_member, role, deleted, created_at, providers:[{id,slug,business_name,status}]}`.
  - `public.complete_onboarding(p_display_name text, p_district text, p_group_code text) returns jsonb` (authenticated): upserts the caller's profile (role `resident` unless already `provider`/`admin`); copies `line_type`/`line_type_checked_at` from the newest `sent` `otp_requests` row for the caller's phone; a non-blank `p_group_code` equal (trimmed, case-insensitive) to `settings.group_code` sets `group_member_at = now()`, a wrong one raises `bad_group_code`; then `perform public.claim_provider_listings()`; returns `my_account()`.
  - `public.set_group_code(p_code text) returns boolean` (authenticated): true and sets `group_member_at` on a match.
  - `public.claim_provider_listings() returns int` (authenticated): links every provider with `status in ('consented','live','paused')`, `user_id is null` and `phone_e164` or `whatsapp_e164` = `'+' || auth.users.phone` of the caller; sets the caller's role to `provider` when it was `resident`; one `audit_log` row `claim_provider` per link (actor = caller); returns how many were linked. No-op without a profile.
  - Trigger `providers_unlink_on_number_change` (BEFORE UPDATE OF phone_e164, whatsapp_e164): clears `user_id` when the linked user's phone matches neither new number.

- [ ] **Step 1: Write failing pgTAP tests** (`accounts.test.sql`):
  - `otp_gate` as `service_role`: three calls for one number → `ok`,`ok`,`ok`, the fourth → `number_limited`; 10 calls from one IP hash across different numbers → `ok`, the 11th → `ip_limited`; with 200 `sent` rows this month at £0.10 and cap £20 → `cap_reached`; a `sent` row dated last month does not count; rows older than 30 days are deleted by the next call. `anon` and `authenticated` cannot execute `otp_gate`/`otp_record` (`42501`).
  - **Gate cannot be bypassed:** `insert into auth.users (id, phone) values (…, '447700900401')` throws `phone sign-up not approved`; after `otp_record(id,'approved','mobile')` for `+447700900401` it succeeds; a second user with the same phone throws `phone already registered`; an approval 16 minutes old throws; `insert … (id, email) values (…, 'x@example.com')` throws `email sign-ups are disabled`, and succeeds after adding `x@example.com` to `admin_emails`; `insert … (id)` with neither succeeds; an UPDATE that sets `deleted_at` and an obfuscated phone succeeds.
  - Onboarding: `complete_onboarding('Sarah K.', 'BL3', 'bolton ')` creates a resident profile with `group_member_at` set and `line_type='mobile'` copied from the `sent` row; `'nope'` raises `bad_group_code`; `'Sarah'` (no initial) raises `23514`; district `'OTHER'` is accepted and `'Bolton'` raises `23514`; an existing admin profile keeps role `admin`.
  - Linking: a `live` provider with `whatsapp_e164 = '+447700900301'` is linked to the user whose phone is `447700900301`, role becomes `provider`, `my_account()->'providers'` has its slug; an `invited` or `removed` provider with the same number is not linked; changing that provider's `phone_e164` and `whatsapp_e164` to another number clears `user_id`.
- [ ] **Step 2:** `npm run db:reset && npm run test:db` → FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(db): phone accounts, OTP gate and auth.users guard`.

---

### Task 4: Phone OTP in the local stack, CI and config

**Files:**
- Modify: `supabase/config.toml`, `scripts/local-stack/start.sh`, `scripts/local-stack/README.md`, `scripts/local-stack/smoke.test.sh`, `scripts/e2e-prepare.sh`, `supabase/tests/fixtures/e2e.sql`
- Create: `tests/unit/test-otp-config.test.ts`

**Interfaces:**
- Produces: the shared test-OTP list (code `123456` for each): `447700900301` (Ace Plumbing's listing number), `447700900401`–`447700900409` (residents). E2E specs use only these. The local GoTrue (v2.177.0) and `supabase start` both accept them without sending SMS.
  - `config.toml`: `[auth] enable_signup = true`; `[auth.email] enable_signup = true` with a comment that this key maps to `GOTRUE_EXTERNAL_EMAIL_ENABLED` and must stay true or admin password sign-in breaks (email sign-ups are refused by the `auth.users` guard instead); `[auth.sms] enable_signup = true`; `[auth.sms.twilio] enabled = true`, `account_sid = "AC00000000000000000000000000000000"`, `message_service_sid = "MG00000000000000000000000000000000"`, `auth_token = "local-dummy-not-a-secret"` (comment: never `supabase config push`; production uses Twilio Verify set in the dashboard); `[auth.sms.test_otp]` with the list above.
  - `start.sh` auth env: `GOTRUE_DISABLE_SIGNUP=false`, `GOTRUE_EXTERNAL_PHONE_ENABLED=true`, `GOTRUE_SMS_AUTOCONFIRM=true`, `GOTRUE_SMS_PROVIDER=twilio`, `GOTRUE_SMS_TWILIO_ACCOUNT_SID`, `GOTRUE_SMS_TWILIO_AUTH_TOKEN`, `GOTRUE_SMS_TWILIO_MESSAGE_SERVICE_SID` (same dummies), `GOTRUE_SMS_TEST_OTP="447700900301:123456,447700900401:123456,…"`, `GOTRUE_RATE_LIMIT_SMS_SENT=1000`. (A dummy provider is required: GoTrue builds the SMS provider before it checks for a test OTP, and a test OTP then skips sending.)
  - `e2e-prepare.sh` inserts `admin@example.test` into `settings.admin_emails` before creating the admin user.
  - `e2e.sql` sets `otp_limits` to `{"number_15m":50,"number_24h":200,"ip_1h":1000,"ip_24h":5000}` (every E2E sign-in comes from 127.0.0.1).

- [ ] **Step 1: Write the failing unit test** `test-otp-config.test.ts`: parses `[auth.sms.test_otp]` from `supabase/config.toml` and the `GOTRUE_SMS_TEST_OTP=` value from `scripts/local-stack/start.sh`; asserts both equal the ten numbers above, each mapped to `123456`, and that every number is in the 07700 900xxx drama range.
- [ ] **Step 2: Extend `smoke.test.sh`** (passes against either stack): approve `+447700900409` with `psql` (`insert into otp_requests (phone_e164, ip_hash, outcome) values ('+447700900409','smoke','approved')`), `POST /auth/v1/otp {"phone":"+447700900409"}` → 200; `POST /auth/v1/verify {"type":"sms","phone":"+447700900409","token":"123456"}` → 200 with an `access_token`; `POST /auth/v1/otp` for un-approved `+447700900408` → non-200 and no `auth.users` row; `POST /auth/v1/signup {"email":"nobody@example.test","password":"xxxxxxxx"}` → non-200. Clean up the smoke rows afterwards.
- [ ] **Step 3:** `npm test` and `npm run stack:stop && npm run stack:start && npm run test:stack` → FAIL. **Step 4:** implement config/env/README ("public sign-ups disabled" becomes "phone sign-ups on, gated by the database; test OTPs listed in config.toml"). **Step 5:** both PASS; `npm run test:e2e` still PASS (admin creation via the allow-list).
- [ ] **Step 6:** Commit `chore: phone OTP with test numbers in the local stack and CI`.

---

### Task 5: Sign-in and onboarding pages

**Files:**
- Create: `lib/otp-gate.ts`, `lib/auth.ts`, `app/platform/sign-in/page.tsx`, `app/platform/sign-in/actions.ts`, `components/auth/SignInForm.tsx`, `app/platform/welcome/page.tsx`, `app/platform/welcome/actions.ts`, `components/auth/WelcomeForm.tsx`, `app/platform/account/page.tsx` (minimal), `app/platform/account/actions.ts` (sign out), `tests/unit/otp-gate.test.ts`, `tests/unit/sign-in-actions.test.ts`, `e2e/helpers/phone.ts`, `e2e/sign-in.spec.ts`
- Modify: `proxy.ts`, `lib/supabase/server.ts` (comment only), `components/BrandBar.tsx`

**Interfaces:**
- Consumes: Task 2 helpers; Task 3 `otp_gate`, `otp_record`, `my_account`, `complete_onboarding`, `claim_provider_listings`.
- Produces:
  - `SIGN_IN_ERRORS` (exact copy): `invalid` "Enter a UK mobile number, like 07700 900123." · `number_limited` "Too many codes for this number. Please wait 15 minutes and try again." · `ip_limited` "Too many sign-in attempts from this connection. Please try again in an hour." · `cap_reached` "Sign-in texts are paused for now. Please try again later." · `voip` "This looks like an internet or virtual number. Please use your own UK mobile number." · `not_mobile` "Please use a UK mobile number that can receive texts." · `lookup_failed` "We couldn't check your number just now. Please try again in a minute." · `send_failed` "We couldn't send a text just now. Please try again in a minute." · `bad_code` "That code didn't work. Check the text and try again, or send a new code."
  - `requestSignInCode(input: string, ip: string, deps: { gate(phone: string, ipHash: string): Promise<{ requestId: number; verdict: string }>; record(id: number, outcome: string, lineType: string | null): Promise<void>; lookup(phone: string): Promise<LineCheck>; send(phone: string): Promise<{ error: unknown | null }> }): Promise<{ ok: true; phone: string } | { ok: false; error: string }>` — order: validate → gate → lookup → `record(approved)` → send → `record(sent | send_failed)`. Any thrown dependency error → `lookup_failed`/`send_failed` copy, logged with `console.error`.
  - `type Account = { userId: string; displayName: string | null; district: string | null; groupMember: boolean; role: "resident" | "provider" | "admin"; deleted: boolean; createdAt: string; providers: { id: string; slug: string; businessName: string; status: string }[] }`
  - `requireSignedIn(next: string): Promise<{ supabase; user }>` → redirects to `/platform/sign-in?next=<safeNext(next)>`; `requireMember(next: string): Promise<{ supabase; user; account: Account }>` → also redirects to `/platform/welcome?next=…` when there is no profile, and signs out + redirects to sign-in when `deleted`.
  - Actions: `requestCode(prev: SignInState, fd: FormData)`, `verifyCode(prev: SignInState, fd: FormData)` with `type SignInState = { step: "phone" | "code"; phone?: string; next: string; error?: string }`; `completeOnboarding(prev: FormState, fd: FormData)` (fields `first_name`, `surname`, `district`, `group_code`, `next`); in `app/platform/account/actions.ts`: `setGroupCode(prev: FormState, fd: FormData)` (wrong code → the same `group_code` error) and `signOutResident(): Promise<void>` → `/platform`. (`FormState` is the existing type in `lib/admin-shared.ts`.)
  - Routes: `/platform/sign-in?next=`, `/platform/welcome?next=`, `/platform/account` (for now: "Signed in as Sarah K.", "Group member" badge or a group-code form, provider-area link when linked, Sign out). All `export const dynamic = "force-dynamic"` with `robots: { index: false }`.
  - `proxy.ts` matcher: `["/admin/:path*", "/platform/sign-in", "/platform/welcome", "/platform/account/:path*", "/platform/p/:slug/review", "/platform/report/:path*", "/platform/provider/:path*"]`; `Cache-Control: private, no-store` on all of them.
  - `BrandBar` gets a static `Account` link to `/platform/account` (no cookie read).

- [ ] **Step 1: Write failing unit tests** `otp-gate.test.ts` with fake deps: invalid input → `invalid` copy and `gate` not called; `number_limited` verdict → copy and `lookup` not called; voip → `record(id,'voip','nonFixedVoip')` and `send` not called; lookup error → `lookup_failed` copy and `send` not called (**fail closed**); mobile → `record(approved)` then `send('+447700900401')` then `record(sent)`, returns `{ok:true, phone:'+447700900401'}`; `send` returning an error → `record(send_failed)` and `send_failed` copy.
- [ ] **Step 2: Write failing action tests** `sign-in-actions.test.ts` (mock `@/lib/supabase/server`, `@/lib/supabase/service`, `next/headers`, `next/navigation`): `verifyCode` with a bad token → `bad_code` copy; with a good token and no profile → redirect `/platform/welcome?next=%2Fplatform%2Fp%2Face%2Freview`; with a profile → `claim_provider_listings` called then redirect to `next`; `next=//evil.example` → redirect `/platform/account`. `completeOnboarding` with group code `nope` → field error `group_code: "That group code isn't right. Leave it blank if you don't have one."` and values kept.
- [ ] **Step 3: Write failing E2E** `e2e/sign-in.spec.ts` (helper `signInWithPhone(page, phone, { first, surname, next })` fills the phone, sends, enters `123456`, and completes Welcome with the given names and `BL1` when it appears):
  - `07700 900401` → code step shows "We've sent a 6-digit code to 07700 900401" → `123456` → Welcome; First name `sarah`, Surname `Khan`, area `BL3`, group code `BOLTON` → account page shows `Signed in as Sarah K.` and `Group member`.
  - Wrong code `000000` → `That code didn't work…`.
  - `07700 900666` → the VoIP copy; `07700 900999` → the lookup-failed copy; `01204 123456` → the invalid copy.
  - **Review Focus 5:** `/platform/sign-in?next=//evil.example` → after sign-in the URL is `/platform/account`.
  - Public pages still set no cookies (`e2e/shell.spec.ts` unchanged and passing).
- [ ] **Step 4:** `npm test && npm run test:e2e` → FAIL. **Step 5:** implement (`signInWithOtp({ phone, options: { shouldCreateUser: true } })` and `verifyOtp({ phone, token, type: "sms" })` on the cookie client in the server action; `otp_gate`/`otp_record` on the service client; IP = first `x-forwarded-for` entry). Phone input `type="tel" autoComplete="tel"`, code input `inputMode="numeric" autoComplete="one-time-code"`.
- [ ] **Step 6:** PASS. Commit `feat: phone sign-in, onboarding and account stub`.

---

### Task 6: Review posting rules (database)

**Files:**
- Create: `supabase/migrations/20261012000004_review_posting.sql`, `supabase/tests/reviews_write.test.sql`

**Interfaces:**
- Consumes: `reviews` (Plan 1), `profiles` (Task 3).
- Produces:
  - Table `review_proofs(id uuid pk, review_id uuid not null → reviews, storage_path text not null unique, mime_type text not null check in ('image/jpeg','image/png','image/webp','application/pdf'), outcome text not null default 'pending' check in ('pending','accepted','rejected'), note text, checked_at timestamptz, checked_by uuid, created_at timestamptz default now())`; unique index `one_active_proof_per_review on (review_id) where outcome in ('pending','accepted')`.
  - Table `review_responses(id uuid pk, review_id uuid not null unique → reviews, provider_id uuid not null → providers, author_id uuid not null → auth.users, body text not null check (char_length(btrim(body)) between 1 and 400), status text not null default 'published' check in ('published','removed'), removal_reason text, created_at, edited_at)`; check removed ⇒ non-blank reason.
  - Table `flags(id uuid pk, target_type text check in ('review','reply'), target_id uuid not null, source text check in ('auto','user'), rule text not null, note text, reporter_id uuid, status text not null default 'open' check in ('open','resolved','dismissed'), resolved_by uuid, resolved_at timestamptz, resolution_note text, created_at timestamptz default now())`; unique `flags_auto_once (target_type, target_id, rule) where source = 'auto'`; unique `flags_one_open_report (target_type, target_id, reporter_id) where source = 'user' and status = 'open'`.
  - All three: RLS on, no grants.
  - `private.run_review_flags(p_review uuid) returns text[]` — **stub returning `'{}'`** here; Task 7 replaces it.
  - `public.review_form_context(p_slug text) returns jsonb` (authenticated): `{provider:{id,slug,business_name}, categories:[{id,name,asks_tidy}] (visible categories only), existing: null | {id, category_id, job_month, value_band, on_time, on_price, quality, tidy, use_again, comment, status, editable_until, has_active_proof}, blocked: null | <error code>}`.
  - `public.submit_review(p jsonb, p_device_hash text) returns jsonb` → `{id, status}`; `public.edit_review(p_id uuid, p jsonb, p_device_hash text) returns jsonb` → `{id, status}`; `public.my_reviews() returns jsonb` → `[{id, provider_slug, business_name, status, removal_reason, created_at, editable_until}]`. `p` keys: `provider_id, category_id, job_month ('YYYY-MM-01'), value_band, on_time, on_price, quality, tidy, use_again, comment`.
  - Errors are raised with the code as the message (`errcode P0001`): `not_member`, `blocked`, `provider_not_found`, `own_listing`, `shares_category`, `new_account_limit`, `already_reviewed`, `removed_before`, `bad_category`, `bad_job_month`, `tidy_required`, `tidy_not_asked`, `comment_too_long`, `comment_has_phone`, `edit_window_closed`, `not_your_review`.
  - Rules (submit): caller has a non-deleted profile with a display name (`not_member`), `blocked_at` null; provider `live`; category visible for that provider; caller is not linked to the provider (`own_listing`) nor to any provider sharing one of its categories (`shares_category`); if `auth.users.created_at > now() - 24h` and the caller has any review at all (any status) → `new_account_limit`; an admin-removed earlier review of this provider (`removal_reason` not equal to `Reviewer deleted their account`) → `removed_before`; `job_month` is the first of a month between 36 months ago and the current London month; `tidy` non-null iff the category's group `asks_tidy`; trimmed comment ≤ 400 (empty → null) and not matching `([0-9][ ().-]*){10,}` (`comment_has_phone`); `unique_violation` on `one_live_review_per_reviewer` → `already_reviewed`. Inserts `status='published'` with the device hash, then `private.run_review_flags(id)`; returns the final status.
  - Rules (edit): own review (`not_your_review`), not removed, `created_at > now() - 14 days` (`edit_window_closed`); same field validation; sets `edited_at`; never changes status itself; re-runs `private.run_review_flags`.

- [ ] **Step 1: Write failing pgTAP tests** with helper users created through approved `otp_requests` rows and profiles: each error code above is raised by the input that should raise it (one `throws_ok` per code, including `tidy_required` for `plumber`, `tidy_not_asked` for `caterer`, `bad_job_month` for next month and for 37 months ago, `shares_category` for a provider-linked user reviewing another plumber, `new_account_limit` for a second review within 24 h, allowed after `update auth.users set created_at = now() - interval '25 hours'`).
  - **Review Focus 2:** comments `'ring him on 07700 900 123'`, `'+44 7700 900123'` and `'0770090012 3'` → `comment_has_phone`; `'Fitted 2 radiators for £350 in 2026'` is accepted.
  - **Review Focus 3:** two `submit_review` calls for the same provider → the second raises `already_reviewed`.
  - Happy path returns `{"status":"published"}`, stores `device_hash`, `tidy` null for `caterer`; a 401-character comment → `comment_too_long`; `edit_review` at day 13 updates and sets `edited_at`; at day 15 → `edit_window_closed`; by another user → `not_your_review`.
  - `anon` cannot execute `submit_review`; `authenticated` cannot `select` or `insert` on `reviews`, `review_proofs`, `review_responses`, `flags`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(db): review posting with anti-fake posting rules`.

---

### Task 7: Auto-flag rules and reports (database)

**Files:**
- Create: `supabase/migrations/20261012000005_review_flags.sql`, `supabase/tests/review_flags.test.sql`

**Interfaces:**
- Consumes: Task 6 tables and the `private.run_review_flags(uuid) returns text[]` signature.
- Produces:
  - `private.run_review_flags(p_review uuid) returns text[]` evaluates, for the review's provider, over non-removed reviews:
    - `burst_48h`: 3 or more reviews created in the last 48 h → every review in that window.
    - `accounts_created_together`: 3 or more reviewers whose `auth.users.created_at` all fall within 10 minutes of this reviewer's → those reviewers' reviews.
    - `shared_device`: another reviewer's review with the same non-null `device_hash` → both reviews.
    - `lone_extreme_new_account`: reviewer account < 24 h old, this is their only review (any status), and `quality = 5` **or** `quality = 1` → this review.
    - For each (review, rule) hit: insert a `flags` row (`source 'auto'`, `on conflict do nothing` on `flags_auto_once`); set `status = 'under_check'` only for reviews whose flag row was **newly** inserted and whose status is `published`. Returns the rules hit for `p_review`.
  - `public.report_review(p_review uuid, p_note text) returns void` (authenticated, member): note 1–500 characters after trim (`report_note_required`); review must be `published`/`under_check` (`review_not_found`); inserts `flags(source 'user', rule 'user_report', reporter_id)`; a second open report by the same person → `already_reported`. Never changes the review's status.

- [ ] **Step 1: Write failing pgTAP tests** (fixture users with controlled `auth.users.created_at`; reviews inserted through `submit_review` under each user's JWT):
  - Two reviews for P in 48 h stay `published`; the third makes all three `under_check` and creates three `burst_48h` flags; the same with three **1-star** reviews (symmetry).
  - Three accounts created 2, 5 and 9 minutes apart reviewing P (accounts older than 24 h, quality 3) → all `under_check` with `accounts_created_together`; accounts 11 minutes apart → not flagged.
  - Two reviewers with the same `device_hash` → both `under_check` with `shared_device`; different hashes → `published`.
  - A 2-hour-old account's first review with quality 5 → `under_check` (`lone_extreme_new_account`); quality 1 → same; quality 4 → `published`; quality 5 from a 3-day-old account → `published`.
  - Admin clearance sticks: set a flagged review back to `published`, then a further burst review → the cleared review stays `published` (its `burst_48h` flag already exists).
  - `edit_review` changing quality to 5 on a new account's only review → `under_check`.
  - `report_review` creates one open `user_report` flag and leaves status unchanged; repeating → `already_reported`; a blank note → `report_note_required`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(db): auto-flag rules and review reports`.

---

### Task 8: Public reviews, profile reviews list and ranking switch-on

**Files:**
- Create: `supabase/migrations/20261012000006_review_public.sql`, `lib/reviews.ts`, `components/profile/ReviewList.tsx`, `components/profile/ReviewItem.tsx`, `lib/revalidate-public.ts`, `tests/unit/reviews.test.ts`
- Modify: `supabase/tests/public_view.test.sql`, `lib/directory.ts`, `tests/unit/directory.test.ts`, `components/ProviderCard.tsx`, `app/platform/p/[slug]/page.tsx`, `app/admin/(protected)/providers/actions.ts`, `tests/unit/admin-actions-revalidate.test.ts`, `supabase/tests/fixtures/e2e.sql`, `e2e/directory.spec.ts`

**Interfaces:**
- Consumes: Task 6 tables.
- Produces:
  - View `public.review_public` (security barrier, owner `postgres`, `grant select to anon, authenticated`) with columns exactly: `id, provider_id, provider_slug, category_name, job_month, value_band, on_time, on_price, quality, tidy, use_again, comment, under_check, reviewer_name, group_member, verified_job, reply_body, reply_at, created_at, edited_at`. Rows: provider `live`, review `status in ('published','under_check')`, reviewer profile not deleted. `reviewer_name = coalesce(display_name, 'Bolton resident')`; `group_member = group_member_at is not null`; `verified_job` = an `accepted` proof exists; reply only when `review_responses.status = 'published'`. No reviewer id, device hash, removal reason or proof path.
  - `provider_public` gains a final column `verified_job_count int` (`create or replace view`, appended last).
  - `type PublicReview = { id; providerId; categoryName; jobMonth; valueBand; onTime; onPrice; quality; tidy: boolean | null; useAgain; comment: string | null; underCheck: boolean; reviewerName: string; groupMember: boolean; verifiedJob: boolean; replyBody: string | null; replyAt: string | null; createdAt: string; editedAt: string | null }`
  - `listProviderReviews(providerId: string): Promise<PublicReview[]>` — newest first, limit 200, public client (cookie-free).
  - `PublicProvider.verifiedJobCount: number`; `ProviderCard` adds "· {n} verified job(s)" after the review count when `n > 0`.
  - `listProvidersInCategory` ranked list requires `score !== null && reviewCount >= 3` (follow-up), order unchanged: score desc, review count desc, last review desc.
  - `revalidatePublicPages(slug?: string): void` — the three existing paths plus `/platform/p/<slug>` when given; admin actions import it instead of their local copy.
  - Review item copy: "Sarah K." + `Group member` pill + `Verified job` pill; month as "October 2026"; answers as "On time · Stuck to the price · Would use again" style lines; "Under check" label with text "This review is being checked. It still counts while we look."; reply block headed "Reply from {businessName}"; links `Report` → `/platform/report/{id}` (rel nofollow).
  - Profile page: section "Reviews" with toggle chips `Verified job` and `Group member` (both optional, AND, client-side, like `AreaFilter`), and a `Leave a review` button → `/platform/p/{slug}/review`. Empty state: "No reviews yet. Used them? Be the first to leave one."

- [ ] **Step 1: Write failing tests:**
  - pgTAP (`public_view.test.sql`): `columns_are('public','review_public', ARRAY[…exact list…])`; `columns_are` on `provider_public` updated with `verified_job_count` last; as `anon`, `review_public` hides `removed` and `under_notice` reviews and reviews of a `paused` provider, shows an `under_check` one with `under_check = true`, never returns a removed reply; `throws_ok` for `anon` selecting `review_proofs`.
  - Vitest: `listProvidersInCategory` keeps a provider with `score` set but `reviewCount: 2` out of `ranked` and in `newcomers` (boundary), and a 3-review provider in `ranked`; `listProviderReviews` maps snake_case rows to `PublicReview`; `revalidatePublicPages("ace")` calls the three existing paths and `/platform/p/ace`.
  - E2E (`directory.spec.ts`): Ace's card score reads `100% would use again 4 reviews · 1 verified job`; the profile of `e2e-ace-plumbing` lists 4 reviews by the fixture reviewers ("Pat P.", "Jo B.", "Sam T.", "Ali R."), the `Verified job` chip narrows the list to the one fixture review with an accepted proof, `Leave a review` links to `/platform/p/e2e-ace-plumbing/review`, and the page HTML still contains no `+44`/`07` digit runs (fetched with `request.get`, per the follow-up).
- [ ] **Step 2:** FAIL. **Step 3:** implement (fixture: providers `e2e-calm-carpentry` (joiner), `e2e-neat-sparks` (electrician), `e2e-tidy-vans` (man-and-van) with no reviews; profiles "Pat P.", "Jo B.", "Sam T.", "Ali R.", "Kim D." for fixture reviewers `…e301`–`…e305`; one `accepted` proof on an Ace review; one `under_check` review of `e2e-calm-carpentry` by `…e305` with an open `burst_48h` flag). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: public reviews on profiles and ranking switch-on`.

---

### Task 9: Review form

**Files:**
- Create: `lib/review-form.ts`, `lib/review-draft.ts`, `components/review/ReviewForm.tsx`, `components/review/TapChoice.tsx`, `app/platform/p/[slug]/review/page.tsx`, `app/platform/p/[slug]/review/actions.ts`, `tests/unit/review-form.test.ts`, `tests/unit/review-draft.test.ts`, `tests/unit/review-actions.test.ts`, `e2e/review.spec.ts`

**Interfaces:**
- Consumes: Task 5 `requireMember`; Task 6 `review_form_context`, `submit_review`, `edit_review`; Task 8 `revalidatePublicPages`; `deviceHash`.
- Produces:
  - `reviewInputSchema` (Zod) mirroring the SQL rules for the fields in Task 6 (`job_month` from `<input type="month">` → `YYYY-MM-01`).
  - `REVIEW_ERRORS: Record<ReviewErrorCode, string>` (exact copy): `own_listing` "You can't review your own listing." · `shares_category` "You can't review someone who works in the same trade as you." · `new_account_limit` "New accounts can post one review in their first 24 hours. Come back tomorrow to add another." · `already_reviewed` "You've already reviewed this provider. You can edit your review instead." · `removed_before` "Your earlier review of this provider was removed, so you can't post another. Contact us if you think that's wrong." · `comment_has_phone` "Please leave phone numbers out of your review." · `comment_too_long` "Keep your comment to 400 characters." · `edit_window_closed` "Reviews can only be edited for 14 days after posting." · `blocked` "Your account can't post reviews. Contact us if you think that's wrong." · `bad_job_month` "Pick the month the job was done, within the last three years." · `tidy_required` "Tell us whether they left the place tidy." · any other code "Something went wrong. Your review is saved on this device; please try again."
  - `statusLabel(status: "published" | "under_check"): "Published" | "Published, under a quick check"`.
  - `reviewErrorMessage(err: { message: string }): string`.
  - `draftKey(slug: string): string` = `bv-review-draft:<slug>`; `saveDraft(storage: Storage | undefined, slug: string, draft: Record<string, string>): void`; `loadDraft(storage, slug): Record<string, string> | null`; `clearDraft(storage, slug): void` — all swallow storage errors.
  - Actions: `submitReview(prev: ReviewFormState, fd: FormData)`, `editReview(prev: ReviewFormState, fd: FormData)` with `type ReviewFormState = { ok?: boolean; status?: "published" | "under_check"; error?: string; errors?: Record<string, string> }`; on success: `revalidatePublicPages(slug)`, `revalidatePath('/platform/account')`.
  - Page: `requireMember('/platform/p/<slug>/review')`; shows `blocked` copy instead of the form; edit mode when `existing` is editable, read-only summary with "Edit closed" when not.
  - Form (single screen, tap buttons with `aria-pressed`): Category (preselected when only one), "When was the job?" (month, max = current month), "Roughly how much was it?" (`Under £250`, `£250 to £1,000`, `£1,000 to £5,000`, `Over £5,000`), "Did they turn up when they said?" (`Yes` / `Late, but they let me know` / `No`), "Did they stick to the price?" (`Yes` / `A bit over, but explained` / `Well over`), "Quality of work" (1–5), "Did they leave the place tidy?" (`Yes` / `No`, only when the chosen category's `asks_tidy`), "Would you use them again?" (`Yes` / `Maybe` / `No`), "Anything to add? (optional)" with a live `n/400` counter, the proof field (Task 10), the prompt "Be honest — mixed jobs are useful too.", and `Post review` / `Save changes`. After success the result panel shows `statusLabel(status)` and a link back to the profile.

- [ ] **Step 1: Write failing unit tests:** `statusLabel` exact strings; `reviewErrorMessage({message:'already_reviewed'})` and an unknown code; `reviewInputSchema` rejects a 401-character comment and accepts `tidy` absent for a non-tidy category; draft helpers round-trip, and a `Storage` whose `setItem` throws does not throw. Action tests (mocked RPC): `submit_review` returning `{status:'under_check'}` → state `{ok:true,status:'under_check'}` and `revalidatePath` called with `/platform/p/ace`; RPC error `already_reviewed` → that copy (**Review Focus 3**); unauthenticated → redirect to sign-in with `next=/platform/p/ace/review`.
- [ ] **Step 2: Write failing E2E** `e2e/review.spec.ts` (each "Published" expectation reviews a provider no other spec touches, because every E2E reviewer shares one device hash):
  - Resident `07700 900402` (onboarded by the helper as Dana Evans) reviews `e2e-calm-carpentry`, quality 4, tidy shown and answered, comment typed → result `Published`; the profile shows the review by "Dana E." with the comment.
  - Resident `07700 900403` reviews `e2e-neat-sparks` with quality 5 → `Published, under a quick check`; the profile shows the "Under check" label.
  - Draft survives sign-in: signed out, open `/platform/p/e2e-tidy-vans/review` → sign-in with `07700 900407` → form; fill the comment, reload → comment restored; after posting, the draft key is gone from `localStorage`.
  - Editing: the 402 resident opens the form again → `Save changes` with the earlier answers filled.
  - A comment with `07700 900 123` → `Please leave phone numbers out of your review.` and nothing posted.
- [ ] **Step 3:** FAIL. **Step 4:** implement (device hash from `headers()` in the action: first `x-forwarded-for` entry + `user-agent`). **Step 5:** PASS.
- [ ] **Step 6:** Commit `feat: review form with draft autosave and 14-day edits`.

---

### Task 10: Proof upload (private bucket, metadata stripped)

**Files:**
- Create: `supabase/migrations/20261012000007_review_proofs.sql`, `lib/proofs.ts`, `tests/unit/proofs.test.ts`, `e2e/proof.spec.ts`, `e2e/fixtures/proof-with-gps.jpg` (made once with a short `sharp().withExif(…)` script and committed)
- Modify: `components/review/ReviewForm.tsx`, `app/platform/p/[slug]/review/actions.ts`, `next.config.ts`, `package.json`, `supabase/tests/reviews_write.test.sql`

**Interfaces:**
- Consumes: Task 6 `review_proofs`; Task 9 actions.
- Produces:
  - Migration: when `to_regclass('storage.buckets') is not null`, upsert bucket `review-proofs` with `public = false`, `file_size_limit = 10485760`, `allowed_mime_types = {image/jpeg,image/png,image/webp,application/pdf}` (the local stack has no Storage, so the guard keeps `db:reset` working). No storage policies: only the service role reaches the objects.
  - `public.add_review_proof(p_review uuid, p_path text, p_mime text) returns uuid` (authenticated): caller owns the review (`not_your_review`), review not removed, within 14 days of `created_at` (`edit_window_closed`), `p_path` starts with `p_review::text || '/'` (`bad_proof_path`); `unique_violation` on `one_active_proof_per_review` → `proof_exists`.
  - `MAX_PROOF_BYTES = 10 * 1024 * 1024`; `class ProofError extends Error`; `type PreparedProof = { bytes: Buffer; mime: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; ext: "jpg" | "png" | "webp" | "pdf" }`.
  - `prepareProof(bytes: Uint8Array): Promise<PreparedProof>` — type from magic bytes only (`FF D8 FF`, `89 50 4E 47`, `RIFF….WEBP`, `%PDF-`), never from the name or browser type; > `MAX_PROOF_BYTES` → `ProofError("Files must be 10 MB or smaller.")`; anything else (HEIC included) → `ProofError("Please upload a photo (JPEG, PNG or WebP) or a PDF.")`; images re-encoded with `sharp(bytes).rotate()` in the same format (sharp writes no metadata unless asked); PDFs stored as uploaded.
  - `uploadProof(reviewId: string, proof: PreparedProof, storage: { upload(path: string, body: Buffer, opts: { contentType: string; upsert: false }): Promise<{ error: unknown }> }): Promise<string>` → path `<reviewId>/<uuid>.<ext>`.
  - In the actions, after a successful submit/edit: prepare → upload with the service client → `add_review_proof` with the user's client; any proof failure leaves the review posted and returns `proofError` ("Your review is posted, but the proof didn't upload: … You can add it by editing your review within 14 days."). On `add_review_proof` failure, remove the uploaded object.
  - Form field: `<input type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf">`, label "Proof of the job", hint "A photo of the invoice or the finished work. Optional — only the admin sees this."
  - `next.config.ts`: `experimental.serverActions.bodySizeLimit = "11mb"` and `experimental.proxyClientMaxBodySize = "11mb"` (the review route is inside the proxy matcher, whose default buffer is 10 MB).
  - `package.json`: `"sharp": "0.35.5"` in dependencies.

- [ ] **Step 1: Write failing unit tests (Review Focus 4):** a JPEG produced by `sharp` with `withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "53/1 34/1 0/1" } })` → `prepareProof` output has `(await sharp(out.bytes).metadata()).exif === undefined` and is still a JPEG; a PNG keeps type `png`; the bytes of a HEIC header (`....ftypheic`) → the photo-or-PDF message; `MAX_PROOF_BYTES + 1` bytes → the 10 MB message; a `%PDF-1.7` buffer → returned unchanged with ext `pdf`; a JPEG renamed `x.pdf` is still treated as JPEG. `uploadProof` builds `<reviewId>/<uuid>.jpg` and passes `contentType: "image/jpeg"`.
- [ ] **Step 2: Write failing pgTAP additions:** `add_review_proof` by a non-owner → `not_your_review`; a path for another review → `bad_proof_path`; a second pending proof → `proof_exists`; after the first is `rejected`, a new one is accepted.
- [ ] **Step 3: Write E2E** `e2e/proof.spec.ts`, skipped unless `SUPABASE_CLI_STACK === "1"` (the local stack has no Storage): resident `07700 900405` reviews `e2e-tidy-vans` with `e2e/fixtures/proof-with-gps.jpg` → `Published`; the account page lists the review with "Proof sent for checking".
- [ ] **Step 4:** FAIL. **Step 5:** implement. **Step 6:** `npm test && npm run test:db` PASS (E2E proof spec passes in CI).
- [ ] **Step 7:** Commit `feat: private proof upload with metadata stripped`.

---

### Task 11: Admin moderation — reviews under check, flags, proofs

**Files:**
- Create: `supabase/migrations/20261012000008_admin_moderation.sql`, `supabase/tests/admin_reviews.test.sql`, `app/admin/(protected)/reviews/page.tsx`, `app/admin/(protected)/reviews/actions.ts`, `app/admin/(protected)/flags/page.tsx`, `app/admin/(protected)/proofs/page.tsx`, `tests/unit/moderation-actions.test.ts`, `e2e/moderation.spec.ts`
- Modify: `app/admin/(protected)/layout.tsx` (nav: Providers · Reviews · Flags · Proofs), `app/admin/(protected)/page.tsx` (counts line)

**Interfaces:**
- Consumes: Tasks 6, 7, 10; `revalidatePublicPages`; `createServiceClient` for signed URLs.
- Produces (each `SECURITY DEFINER`, `not admin` unless `is_admin()`, writes one `audit_log` row per write, granted to `authenticated`):
  - Reads: `admin_counts() returns jsonb` `{under_check, open_flags, pending_proofs}`; `admin_list_reviews_under_check() returns jsonb` (review fields + provider slug/name + reviewer display name + `account_created_at` + its flags); `admin_list_open_flags() returns jsonb` (flag + target summary + reporter display name); `admin_list_pending_proofs() returns jsonb` (proof id, review summary, `mime_type`, `created_at`); `admin_proof_path(p_proof uuid) returns text`.
  - Writes: `admin_set_review_status(p_review uuid, p_status review_status, p_reason text) returns text` (returns the provider slug): `under_check → published` (clear; resolves the review's open **auto** flags; audit `clear_review`); `published → under_check` (reason required; audit `check_review`); `published | under_check → removed` (reason required, stored in `removal_reason`; resolves all the review's open flags; audit `remove_review`); every other transition raises `transition not allowed` (removal is final). `admin_resolve_flag(p_flag uuid, p_outcome text, p_note text) returns void` (`resolved` | `dismissed`; audit `resolve_flag`). `admin_check_proof(p_proof uuid, p_outcome text, p_note text) returns text` (`accepted` | `rejected`, only from `pending`; sets `checked_at`, `checked_by`; audit `check_proof`; returns slug). `admin_remove_reply(p_reply uuid, p_reason text) returns text` (audit `remove_reply`; returns slug).
  - Server actions `clearReview`, `removeReview`, `resolveFlag`, `checkProof`, `removeReply` (all `(prev: FormState, fd: FormData) => Promise<FormState>`, Zod-validated, `requireAdmin()`, then `revalidatePublicPages(slug)` and `revalidatePath('/admin/reviews' | '/admin/flags' | '/admin/proofs')`).
  - Pages: `/admin/reviews` ("Reviews under check": each with rules hit, Clear check, Remove with a required reason textarea); `/admin/flags` (open flags incl. user reports with the reporter's note; Resolve / Dismiss; link to the review on the profile); `/admin/proofs` (image shown from a 60-second signed URL via `createServiceClient().storage.from('review-proofs').createSignedUrl(path, 60)`, PDF as an "Open PDF" link; Accept → "Verified job", Reject with note). Pages are `force-dynamic`.

- [ ] **Step 1: Write failing pgTAP tests:** every function raises `not admin` for a resident; `admin_set_review_status(r,'removed','')` raises; with a reason → `removed`, reason stored, one `audit_log` row `remove_review`, the review's open flags resolved, and it disappears from `review_public`; `removed → published` raises `transition not allowed`; clearing an `under_check` review resolves its auto flags but not an open `user_report`; `admin_check_proof(p,'accepted',null)` makes `review_public.verified_job` true and `provider_public.verified_job_count` 1; accepting it twice raises.
- [ ] **Step 2: Write failing action tests:** `removeReview` without a reason → field error `reason: "Enter a reason. It's kept in the audit log."` and no RPC; with a reason → RPC called and `revalidatePath('/platform/p/ace','page'…)` per `revalidatePublicPages('ace')`.
- [ ] **Step 3: Write failing E2E** `e2e/moderation.spec.ts` (no count assertions: other specs create under-check reviews in parallel): admin opens Reviews, sees the fixture `e2e-calm-carpentry` review with rule `burst_48h`, removes it with reason "Fake: same household as the provider"; the profile no longer shows it; the audit log row exists (checked with `psql`).
- [ ] **Step 4:** FAIL. **Step 5:** implement. **Step 6:** PASS.
- [ ] **Step 7:** Commit `feat(admin): review, flag and proof moderation`.

---

### Task 12: Provider area, replies and the Report page

**Files:**
- Create: `supabase/migrations/20261012000009_provider_replies.sql`, `supabase/tests/replies.test.sql`, `app/platform/provider/page.tsx`, `app/platform/provider/actions.ts`, `components/provider/ReplyForm.tsx`, `app/platform/report/[reviewId]/page.tsx`, `app/platform/report/[reviewId]/actions.ts`, `tests/unit/reply-actions.test.ts`, `e2e/provider.spec.ts`

**Interfaces:**
- Consumes: Task 3 linking; Task 5 `requireMember`; Task 7 `report_review`; Task 8 `revalidatePublicPages`.
- Produces:
  - `public.provider_my_reviews() returns jsonb` (authenticated): for each listing linked to the caller, `{provider:{id,slug,business_name}, reviews:[{id, status, created_at, reviewer_name, category_name, quality, use_again, comment, reply: null | {id, body, created_at, editable_until}}]}` for statuses `published`/`under_check`.
  - `public.provider_reply(p_review uuid, p_body text) returns text` (authenticated, returns slug): caller is linked to the review's provider (`not_your_listing`); review `published`/`under_check`; body 1–400 after trim (`reply_too_long` / `reply_empty`), no phone number (`reply_has_phone`, same pattern as Task 6); insert, or update when the existing reply is < 14 days old (`edit_window_closed`) and not removed; one per review.
  - Actions `saveReply(prev: FormState, fd: FormData)` (fields `review_id`, `body`) and `reportReview(prev: FormState, fd: FormData)` (fields `review_id`, `note`); report success copy: "Thanks. We'll look at this review. Reports don't change a review on their own."
  - `/platform/provider`: `requireMember('/platform/provider')`; with no linked listing: "We couldn't find a listing with this number. If you're listed, sign in with the mobile number on your listing, or contact us."; otherwise per review: answers, comment, status label, `Reply` (textarea with `n/400` counter) or the existing reply with `Edit reply` until 14 days, and `Report`.
  - `/platform/report/[reviewId]`: `requireMember`; note textarea "What's wrong with this review?" (required, ≤ 500); submits `report_review`.

- [ ] **Step 1: Write failing pgTAP tests:** a non-linked user → `not_your_listing`; 401 characters → `reply_too_long`; a second `provider_reply` within 14 days updates the same row (`count = 1`, `edited_at` set); at day 15 → `edit_window_closed`; the reply shows in `review_public.reply_body`; after `admin_remove_reply` it does not.
- [ ] **Step 2: Write failing action tests:** `saveReply` success calls `revalidatePublicPages('e2e-ace-plumbing')`; RPC `reply_has_phone` → "Please leave phone numbers out of your reply."
- [ ] **Step 3: Write failing E2E** `e2e/provider.spec.ts`: sign in with `07700 900301` (Ace Plumbing's listing number) → Welcome → after onboarding the account page links to `Your listing`; `/platform/provider` lists Ace's 4 fixture reviews; reply "Thanks Pat, glad the boiler's behaving." → the public profile shows "Reply from Ace Plumbing" with that text; the same provider opening `/platform/p/e2e-fresh-pipes/review` sees "You can't review someone who works in the same trade as you."; resident `07700 900406` reports an Ace review with a note → the thanks copy, and the admin Flags page lists it as `user_report`.
- [ ] **Step 4:** FAIL. **Step 5:** implement. **Step 6:** PASS.
- [ ] **Step 7:** Commit `feat: provider replies and review reports`.

---

### Task 13: Account page and account deletion

**Files:**
- Create: `supabase/migrations/20261012000010_account_deletion.sql`, `supabase/tests/account_deletion.test.sql`, `tests/unit/account-actions.test.ts`, `e2e/account.spec.ts`
- Modify: `app/platform/account/page.tsx`, `app/platform/account/actions.ts`

**Interfaces:**
- Consumes: Task 6 `my_reviews`; Task 3 `set_group_code`; Task 5 `requireMember`.
- Produces:
  - Table `phone_retention(id bigint identity pk, user_id uuid not null, phone_e164 text not null, deleted_at timestamptz not null default now(), purge_after timestamptz not null default now() + interval '12 months')`; RLS on; `revoke all … from public, anon, authenticated, service_role` (readable only by `postgres`, i.e. the owner in the SQL editor).
  - `public.delete_my_account() returns text[]` (authenticated; returns the slugs of affected providers for revalidation): idempotent; copies `'+' || auth.users.phone` into `phone_retention`; deletes `phone_retention` rows past `purge_after`; sets the caller's non-removed reviews to `removed` with `removal_reason = 'Reviewer deleted their account'`; sets their replies to `removed` with the same reason; clears `providers.user_id` for linked listings (the listings stay); sets `profiles.deleted_at = now()`, `display_name = null`; one `audit_log` row `delete_account` (actor = caller).
  - Action `deleteAccount(prev: FormState, fd: FormData)`: requires the checkbox `confirm` ("I understand my reviews will be taken down"); calls `delete_my_account`, then `createServiceClient().auth.admin.deleteUser(user.id, true)` (soft delete: the `auth.users` row stays for the reviews' foreign key, GoTrue obfuscates the phone, so the number can sign up afresh), then signs out, revalidates the returned slugs, and redirects to `/platform`. If the soft delete fails after the RPC, the action returns "Your reviews are down, but we couldn't finish deleting your account. Please try again." and a retry repeats both steps safely.
  - Account page: "Signed in as Sarah K." · area · `Group member` or the group-code form (`set_group_code`) · "My reviews" (provider name, month posted, `statusLabel`, or "Removed: {reason}", `Edit` while `editable_until` is in the future, proof state "Proof sent for checking" / "Verified job" / "Proof not accepted") · provider-area link when linked · `Sign out` · "Delete account" (explains: reviews are taken down; we keep your phone number privately for 12 months in case of legal claims, as the privacy notice says).

- [ ] **Step 1: Write failing pgTAP tests:** after `delete_my_account()` the caller's review is `removed` with that reason and gone from `review_public`; `phone_retention` has one row with `purge_after` ≈ `now() + 12 months`; a linked provider's `user_id` is null and still `live`; `profiles.deleted_at` set; calling again adds no second retention row; `authenticated` and `service_role` cannot `select` from `phone_retention`; an expired retention row is purged by the call; after deletion `submit_review` raises `not_member`.
- [ ] **Step 2: Write failing action tests:** no `confirm` → field error and no RPC; success calls `deleteUser(id, true)` after the RPC and redirects; `deleteUser` error → the retry message.
- [ ] **Step 3: Write failing E2E** `e2e/account.spec.ts`: resident `07700 900404` reviews `e2e-neat-sparks` (quality 3), sees it under "My reviews" with `Edit`; deletes the account → lands on `/platform`; the review is gone from the profile; signing in again with `07700 900404` goes to Welcome (a fresh account).
- [ ] **Step 4:** FAIL. **Step 5:** implement. **Step 6:** PASS.
- [ ] **Step 7:** Commit `feat: account page and account deletion with phone retention`.

---

### Task 14: Policy pages and the consent wording

**Files:**
- Create: `app/(info)/review-policy/page.tsx`, `app/(info)/fake-reviews-policy/page.tsx`
- Modify: `components/SiteFooter.tsx`, `app/(info)/privacy/page.tsx`, `app/(info)/terms/page.tsx`, `app/(info)/how-ratings-work/page.tsx`, `lib/consent-text.ts`, `tests/unit/consent-text.test.ts`, `e2e/policies.spec.ts`

**Interfaces:**
- Produces:
  - `/review-policy` ("Review policy", `PolicyPage` with the draft banner): who can review (a phone-verified person who used the provider), what to write (your own experience, the job month, no phone numbers or personal details), reviews go live at once and are not pre-approved, "Published, under a quick check" explained, one review per provider per person, 14-day edits, providers can reply once (editable 14 days), Report, removal only for cause with a logged reason (fake, not a real customer, abusive, unlawful, personal data), never removed because a provider disagrees, proof is optional and only the admin sees it, "Verified job" means the admin accepted proof.
  - `/fake-reviews-policy` ("Fake reviews policy"): states the Digital Markets, Competition and Consumers Act 2024 bans fake reviews and concealed incentivised reviews; the posting rules and the four automatic checks in plain words (from §7, including that they apply to positive and negative bursts alike); what happens to a flagged review (stays visible with a label while checked); removal and the audit log; no incentives offered for reviews; how to report; dated "Risk assessment: 12 October 2026" paragraph naming the main risks (friends and family, competitors, review swaps, bulk accounts) and the control for each.
  - Footer links add `Review policy` and `Fake reviews`.
  - Privacy notice adds a "People who sign in" section: mobile number (held by our sign-in provider, checked with Twilio to block internet numbers; used for sign-in codes only), display name ("Sarah K."), postcode district, group membership, reviews and replies, optional proof files (private, metadata removed, seen only by the admin), sign-in attempt records (number and a scrambled connection signature, kept 30 days), a hashed device signature with each review to detect fake reviews; lawful bases (contract for the account; legitimate interests for fraud prevention); processors Supabase (London) and Twilio; cookies: signed-in people get sign-in cookies, browsers who don't sign in get none; deletion: reviews are taken down and the phone number is kept privately for 12 months for legal claims, then deleted.
  - Terms: present tense ("where residents leave reviews"; "Reviews are the opinions…"), the review rules by reference to `/review-policy`, and "Report" on each review.
  - How ratings work: present tense throughout ("Profiles show figures worked out from residents' reviews. Here is what they mean." / "Reviewers also give a quality score out of 5.").
  - Consent "reviews" card body: "Reviews go live without your approval. We don't remove one simply because you disagree, and you can reply to any review from your own page." and `CONSENT_TEXT_VERSION = "2026-10-12"`.

- [ ] **Step 1: Write failing tests:** `consent-text.test.ts` expects version `2026-10-12` and the phrase `you can reply to any review`, and no longer `you'll be able to reply to reviews`; `e2e/policies.spec.ts` checks `/review-policy` and `/fake-reviews-policy` return 200 with their `<h1>`, the draft banner, and footer links on every page; the fake-reviews page contains `Digital Markets, Competition and Consumers Act 2024` and `Risk assessment: 12 October 2026`; `/privacy` contains `12 months` and `Twilio`.
- [ ] **Step 2:** FAIL. **Step 3:** write the pages and edits. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: review and fake-reviews policies; present-tense consent wording (2026-10-12)`.

---

### Task 15: Switch the public copy on, and the docs

**Files:**
- Create: `tests/unit/no-stale-claims.test.ts`
- Modify: every file in the table below, `e2e/home.spec.ts`, `e2e/directory.spec.ts`, `README.md`, `assets/diagrams/02-live-and-coming.mmd` + `.svg`, `public/shots/home-howto.webp`, `public/shots/profile.webp`, `scripts/shots-demo.sql` (sample reviews so the profile shot shows the reviews section)

**Interfaces:** none new.

Every claim this plan makes true, with its new wording:

| File:line (today) | Now | Becomes |
|---|---|---|
| `app/platform/page.tsx:47` | "Pick a trade and your area. Once reviews open, the ones people would use again come first." | "Pick a trade and your area. The ones people would use again come first." |
| `app/platform/page.tsx:57` | "Reviews are coming soon, so you can tell the next person how it went." | "Leave a review in a minute, so the next person knows how it went." |
| `app/platform/c/[category]/page.tsx:59` | "{n} local pros · reviews coming soon" | "{n} local pros · ranked by reviews" |
| `components/category/AreaFilter.tsx:43` | "Not enough reviews for a score yet. Reviews are coming soon." | "Not enough reviews for a score yet. Used one of them? Leave a review on their page." |
| `app/(site)/page.tsx:33` | "…Once reviews open, people are ranked by how many would use them again." | "…People are ranked by how many would use them again." |
| `app/(site)/page.tsx:52-53` | `soon: true`; "When reviews arrive you'll be able to reply to every one, so customers hear your side." | no `soon`; "Sign in with the number on your listing and reply to every review, so customers hear your side." |
| `app/(site)/page.tsx:58` | "…Once reviews open, your place will come from what your customers say." | "…Your place comes from what your customers say." |
| `app/(site)/page.tsx:66` | "Once reviews open, the order will come from how many would use someone again…" | "The order comes from how many would use someone again…" |
| `app/(site)/page.tsx:76` | "…visitors get no cookies and no account to make." | "…browsing sets no cookies and needs no account." |
| `app/(site)/page.tsx:166` | "Once reviews open, people will be ranked by how many neighbours would use them again" | "People are ranked by how many neighbours would use them again" |
| `app/(site)/page.tsx:210` | "Once reviews open: one honest number from people who've had the work done…" | "One honest number from people who've had the work done…" |
| `app/(site)/page.tsx:257` | "Cards marked “Coming soon” are being built next." | sentence removed (no card is marked soon) |
| `components/site/content.ts:83` | "Once reviews open, profiles lead with one honest number…" | "Profiles lead with one honest number…" |
| `components/site/content.ts:107` | "…Once reviews open, nobody gets a score until they have three…" | "…Nobody gets a score until they have three…" |
| `components/site/content.ts:111-116` | alt "…step three: reviews are coming soon"; `soon: true`; "Reviews, coming soon"; "Soon you'll vouch for the people you've used…" | alt "How it works, with step three: leave a review"; no `soon`; title "Vouch for them"; "Vouch for the people you've used in a minute, so the next person in Bolton knows." |
| `components/site/content.ts:137` | "Yes for residents: free to use, no sign-up, nothing to download." | "Yes for residents: free to use, nothing to download, and no sign-up to look or call. You only sign in with your mobile to leave a review." |
| `components/site/content.ts:147` | "Reviews are coming soon, so for now everyone is listed as new. Once reviews open, people will be ranked…" | "People are ranked by how many reviewers said they'd use them again. Nobody gets a score until they have three reviews, newer reviews count for more, and a handful of reviews can't put anyone on top. Nobody can pay to move up." |
| `components/site/content.ts` FAQ "How do I report a problem or a review?" | ticket routes only | prefix: "On a review, tap Report. For anything else, " + ticket routes |
| `components/site/content.ts:202` | "If you're just looking: no account, and no cookies…" | unchanged, plus a second paragraph: "If you sign in to leave a review, we keep your mobile number, the name you show (like Sarah K.) and your reviews. The privacy notice has the detail." |
| `lib/consent-text.ts:56` | "…you'll be able to reply to reviews." | Task 14 wording |
| `app/(info)/terms/page.tsx:14,20` · `how-ratings-work/page.tsx:9,23` · `privacy/page.tsx:37` | future tense / "Cookies are used only for the admin login." | Task 14 wording |
| `docs/launch/LAUNCH.md:65` | "people who've used you will be able to leave reviews … you'll be able to reply to any review" | "people who've used you can leave reviews … you can reply to any review by signing in with your number" |
| `docs/launch/LAUNCH.md:75` | "Reviews are coming soon, so it's worth sharing your link with happy customers." | "Reviews are open, so share your link with happy customers and ask them to leave one. Sign in with this number to reply." |
| `docs/launch/LAUNCH.md:90` | "• Reviews from people in Bolton are coming soon" | "• Leave a review for someone you've used: sign in with your mobile, takes a minute" |
| `docs/launch/LAUNCH.md:101-104` | "Coming (Plan 2): resident sign-in and reviews, community questions, trader dashboards and the paid Verified tier." | Live adds "phone sign-in, reviews with replies and proof checks, review moderation"; Coming: "community questions (Plan 3); trader dashboard and the optional Verified tier (Plan 4); complaints process and monitoring (Plan 5)." |

Unchanged on purpose (still true for browsing): `app/(site)/layout.tsx:10` "Free, no sign-up."; `app/(site)/page.tsx:35,177,215`, `components/site/content.ts:99`; `app/(site)/page.tsx:42` "optional paid upgrade is coming later" (Plan 4).

- [ ] **Step 1: Write the failing guard test** `no-stale-claims.test.ts`: reads every file under `app/`, `components/`, `lib/`, `docs/launch/` and asserts none contains (case-insensitive) `reviews coming soon`, `reviews are coming soon`, `once reviews open`, `when reviews arrive`, `you'll be able to reply`, `will be able to leave`, `reviews, coming soon`, `cookies are used only for the admin`; and that no entry in `DECK` or `TRADER_POINTS` has `soon: true`.
- [ ] **Step 2:** Update `e2e/home.spec.ts` ("how it works invites a review": `Leave a review in a minute`) and `e2e/directory.spec.ts` (regex `^\d+ local pros? · ranked by reviews$`). Run `npm test && npm run test:e2e` → FAIL.
- [ ] **Step 3:** Make the table's edits. README: move "Resident sign-in and reviews" to *Live today* (phone sign-in, reviews, replies, proofs, moderation, account deletion), *Coming* keeps community questions, trader dashboards, Verified tier; replace the "Never claim reviews exist" caution with "Never claim community questions, dashboards or Verified exist before they do"; Supabase deploy steps per *Owner actions* below (sign-ups **on**, email provider stays on); Railway variables add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`; "Where things live" rows for sign-in, reviews, provider area, moderation. Update `02-live-and-coming.mmd` and run `node scripts/build-diagrams.mjs`. Regenerate shots with `PW_CHROMIUM_PATH=… node scripts/shots.mjs` (home-howto now shows step three's new text; profile shows reviews).
- [ ] **Step 4:** Full suite: `npm run lint && npm run typecheck && npm test && npm run db:reset && npm run test:db && npm run test:e2e` → PASS. `grep -rniE "coming soon|once reviews open|when reviews arrive" app components lib docs/launch` → only `components/site/CardDeck.tsx`'s generic `Coming soon` tag and `app/(site)/page.tsx`'s `{p.soon && <em>Coming soon</em>}`, both unused by current content.
- [ ] **Step 5:** Commit `feat: switch public copy to live reviews; docs and screenshots`.

---

## Owner actions (outside the code)

Do these before merging Plan 2 to `main` (Railway deploys `main`), in this order:

1. **Twilio account:** upgrade from trial (trial accounts only text verified numbers). Messaging/Verify **Geo permissions: United Kingdom only.** Set a **usage trigger** (Console → Monitor → Usage triggers) at £20/month on Verify + Lookup that emails you — the backstop behind the app's own cap.
2. **Twilio Verify service:** Console → Verify → Services → Create "Bolton Vouched", 6-digit codes, SMS channel on, **Fraud Guard on** (default). Note the **Service SID (`VA…`)**.
3. **Twilio Lookup:** Console → Lookup → enable **Line Type Intelligence** (Lookup v2, paid per request). Note the **Account SID (`AC…`)** and **Auth Token**.
4. **Supabase → Authentication → Sign In / Providers → Phone:** enable; SMS provider **Twilio Verify**; paste Account SID, Auth Token and Verify Service SID. Do **not** add test phone numbers in production.
5. **Supabase → Authentication → Sign In / Providers → "Allow new users to sign up": ON.** Phone sign-up needs it. Email sign-ups stay off because the database refuses them (migration `20261012000003` adds a guard on `auth.users`: an account with an email and no phone is refused unless that email is in `settings.admin_emails`; an account with a phone is refused unless the app's number check approved it in the last 15 minutes). **Leave the Email provider ON** (turning it off also blocks the admin's email-and-password sign-in) and keep "Confirm email" on.
6. **Supabase → Authentication → Rate Limits:** raise "SMS messages sent per hour" from 30 to 60, and "Sign-ups and sign-ins" and "Token verifications" (per 5 minutes per IP) to 150 — every code request reaches Supabase from Railway's server address, so these are shared by everyone. The app applies its own per-number and per-person limits first.
7. **Supabase → SQL editor:** paste and run `supabase/migrations/20261012000002_…` through `20261012000010_…`, in filename order, once each.
8. **Supabase → Storage:** check bucket `review-proofs` exists, is **private**, limit 10 MB, MIME types JPEG/PNG/WebP/PDF. If migration `…000007` ran before Storage was available, create it by hand with exactly those settings. Add no policies.
9. **New admins only:** before adding another admin user, run `update public.settings set value = value || '["new-admin@example.com"]'::jsonb where key = 'admin_emails';`, then add the user as in the README.
10. **Railway → service `web` → Variables:** add `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` (server only, never `NEXT_PUBLIC_`). Make sure `TWILIO_LOOKUP_STUB` is **not** set. Keep `SUPABASE_SERVICE_ROLE_KEY` and a real `DEVICE_HASH_SECRET`. Redeploy.
11. **Never run `supabase config push`:** `supabase/config.toml` holds dummy Twilio settings and test OTP numbers for local and CI use only.
12. **Smoke test after deploy:** sign in with your own mobile, leave and then delete a test review on a test provider, reply as a provider (sign in with a number on a listing), and check the admin Reviews/Flags/Proofs pages.
13. **Legal:** ask the solicitor to review the new Review policy, Fake reviews policy and the updated privacy notice (they carry the draft banner). Existing consents stay valid; the new consent version only applies to new links.

---

## Spec ambiguities and the rulings used

1. **"Several accounts created within 10 minutes"** = 3 or more reviewers of the same provider whose accounts were created within 10 minutes of the new reviewer's.
2. **Burst** = 3 or more non-removed reviews of one provider created within 48 h; every review in the window goes under check.
3. **"Brand-new account whose only activity is a single 5-star review"** = account under 24 h old, first review, quality 5; the symmetric negative case is quality 1.
4. **Shared `device_hash`** flags both reviews; flags are once per (review, rule), so an admin clearance sticks.
5. **Edits** re-run all rules and the field checks but never clear `under_check` themselves; 14 days counts from `created_at` (reviews) or the reply's `created_at` (replies).
6. **Removal is final** in Plan 2 (no restore). A reviewer whose review of a provider was removed by an admin cannot post another for that provider; removals caused by deleting an account don't count.
7. **Reports** need sign-in, create a flag only, and never change a review's status; one open report per person per review.
8. **`under_notice`** reviews are hidden publicly (nothing sets that status until Plan 5).
9. **Job month** must be within the last 36 months and not in the future.
10. **Display name:** the form asks first name and surname; only "Sarah K." is stored. District is a BL list value or `OTHER` and is never shown publicly.
11. **Group code** is matched trimmed and case-insensitively; the "Group member" badge reflects current membership on all of a person's content; it can also be entered later on the account page.
12. **Provider linking** matches the listing's phone **or** WhatsApp number, for `consented`/`live`/`paused` listings, at onboarding and every sign-in; changing a listing's numbers unlinks a non-matching account.
13. **Line types:** only `mobile` passes; `fixedVoip`/`nonFixedVoip` get the VoIP message; other types get the "needs a mobile" message; Lookup errors or a 5-second timeout fail closed.
14. **Rate limits:** per number 3 per 15 minutes and 6 per 24 h; per IP 10 per hour and 20 per 24 h; monthly cap £20 at £0.10 per sent code (settings, editable).
15. **"Email signups stay disabled"** is enforced in the database, because Supabase's email-provider switch would also disable the admin's password sign-in.
16. **Account deletion** is a soft delete in Supabase Auth (the row stays for the reviews' foreign key; the phone is obfuscated so the number can sign up afresh); the real number goes to `phone_retention` for 12 months, readable only by the database owner; purge runs on each deletion (a scheduled purge belongs with Plan 5's jobs).
17. **Changing phone number** is not supported in Plan 2 (the auth guard refuses unapproved phone changes).
18. **Proofs:** one active proof per review (a new one after rejection); can be added during the 14-day edit window; PDFs stored as uploaded; HEIC refused (iOS converts on pick).
19. **Profile "distribution"** is the existing StatCard bars; no new histogram.
20. **Public pages never read cookies**; signed-in state appears only on the new dynamic routes, and the brand bar's `Account` link is static.
21. **Contact taps** still log `actor_id = null`; attributing taps to signed-in people belongs with Plan 4's enquiry stats.
22. **Consent tokens** expire 14 days after creation or rotation; tokens already sent get 14 days from the migration.
23. **Hosting** is Railway, not Vercel as the spec says; environment steps target Railway.

## Done when

A resident can sign in with a UK mobile, set up "Sarah K.", review a provider (with optional proof), see "Published" or "Published, under a quick check", edit within 14 days and delete their account; a provider can sign in with the number on their listing and reply; the public profile shows reviews with filters, replies and Report; the category list ranks scored providers; the admin can clear or remove reviews with a logged reason, resolve flags and accept proofs into "Verified job"; no public copy says reviews are coming; and lint, typecheck, unit, pgTAP and Playwright pass in CI.
