# Bolton Vouched — Plan 2b: Free Sign-in (Google + Email Code)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Residents and traders sign in with **Continue with Google** or a **6-digit email code** instead of a texted code (the owner won't pay for Twilio), with every anti-fake rule that leaned on the phone number rebuilt on a hashed sign-in identity, reviews from email-only accounts held for admin approval, traders linked to their listing by an admin-issued single-use link, and phone sign-in kept in the code but switched off.

**Architecture:** Google uses Supabase OAuth with PKCE (server action starts it, `/platform/auth/callback` route handler exchanges the code). Email uses Supabase email OTP (`signInWithOtp({ email })` + `verifyOtp({ type: "email" })`) behind a database gate (`email_gate`) that mirrors `otp_gate`: format, disposable domains, per-address and per-IP (/64) limits, Resend's free-tier caps, and a single-use nonce that the existing `auth.users` guard requires for any new email account. The guard also accepts `google` inserts and still refuses password sign-ups. A per-project pepper turns phone numbers, normalised emails and Google subject ids into HMAC identity keys; account deletion retains them 12 months, and "removal survives re-signup" checks them. A new review status `pending` holds email-only accounts' reviews (hidden, unscored) until the admin approves.

**Tech Stack:** as Plan 2 (Next.js 16.4.0 App Router, `@supabase/supabase-js` 2.117.3 / `@supabase/auth-js` 2.117.3, `@supabase/ssr` 0.12.7 (its server client defaults to `flowType: "pkce"`), Zod 4, Vitest 5, Playwright 1.64, pgTAP, local GoTrue v2.177.0 / Supabase CLI 2.120.0 in CI). No new runtime dependency. Resend is used only as Supabase's SMTP server (no SDK, no API calls from the app).

**Spec:** the owner decision below (2026-10-12) amends `docs/superpowers/specs/2026-10-11-bolton-vouched-design.md` §1 rule 3, §5 "Login and activation", §7 Signup rows and §8 SMS; and `docs/superpowers/plans/2026-10-12-plan-2-reviews-and-sign-in.md` (whose Global Constraints still apply except where this plan replaces them).

**Owner decision (the spec for this plan):** phone SMS is switched off. (1) Continue with Google — Supabase Google OAuth, PKCE, callback route, `safeNext`; Google accounts review normally (auto-flags still apply). (2) Email 6-digit code — code, not magic link, so it works inside the installed PWA; custom SMTP via Resend free tier, sender `noreply@ysbdesigns.uk`; every review by an email-only account is held (new status, hidden, unscored) until an admin approves it; admin queue "Reviews awaiting approval" with Approve / Remove-with-reason; reviewer sees "Waiting for a quick check — it'll appear once approved". (3) Block disposable domains (repo list + DB check); rate limits on code sends and wrong codes per address and per IP (/64); the `auth.users` guard accepts only `google` or email sign-ups carrying the app's nonce, still refuses passwords, admin allow-list unchanged. (4) Phone path kept behind `SIGN_IN_PHONE=on|off` (default off); sign-in page shows enabled methods only; SMS hook 403 when off. (5) Admin "Trader sign-in link" (single-use, 14 days, audit-logged) links the opening signed-in account to the listing; refuse if either side is already linked; phone linking only when phone is on. (6) Removal-survives-resignup and retention work for Google (subject id) and email (normalised address) via a hashed identity key kept 12 months after deletion; device-hash, burst and accounts-created-together rules unchanged. (7) Copy/legal updates; bump `CONSENT_TEXT_VERSION` only if consent text changes. (8) Unit + pgTAP + E2E, with a local inbox for codes and no Google in CI. (9) Owner actions and a one-paste production script.

**House facts:** production Supabase project `mmarznvndvbwyhhtbfjy`; site `https://boltonvouched.ysbdesigns.uk`; Railway deploys `main`; production migrations are pasted into the Supabase SQL editor (Plan 2 used `docs/launch/plan-2-production.sql`); Railway's edge appends one `X-Forwarded-For` hop (`lib/client-ip.ts`); `ipHash()` already cuts IPv6 to its /64 (`lib/ip-hash.ts`).

## Global Constraints

- Everything in Plan 2's Global Constraints still holds except: sign-in is **Google or a 6-digit email code** (phone only with `SIGN_IN_PHONE=on`); "every posted review has a phone-verified person behind it" becomes "every posted review has a Google, email-code or phone-confirmed account behind it".
- `SIGN_IN_PHONE` is read server-side at request time; only the exact value `on` (trimmed, case-insensitive) enables phone; anything else, including unset, is **off**.
- Review statuses: `pending` (new) neither shows publicly nor counts toward scores, exactly like `under_notice`. Public queries keep filtering `status in ('published','under_check')`.
- Reviewer-facing copy, verbatim: **"Waiting for a quick check — it'll appear once approved"** (em dash). Admin section heading verbatim: **"Reviews awaiting approval"**; buttons **"Approve"** and **"Remove"** (reason required).
- Email codes: 6 digits, expire after **900 seconds**; sender `noreply@ysbdesigns.uk`, name **Bolton Vouched**, subject **"Your Bolton Vouched sign-in code"**; the template shows `{{ .Token }}` and contains **no** link (`{{ .ConfirmationURL }}` must not appear).
- Email limits (`settings.email_limits`, editable): per normalised address **3 per 15 min, 6 per 24 h**; per IP hash **10 per hour, 20 per 24 h**; **90 sent per London day, 2,900 per London month** (under Resend's free 100/day, 3,000/month). Wrong codes reuse `settings.otp_verify_limits` (5 per address per 15 min, 20 per IP per hour).
- Email normalisation (identical in `lib/email.ts` and `private.normalise_email`): trim, lowercase, drop everything from the first `+` in the local part, and for `gmail.com`/`googlemail.com` drop dots in the local part and use `gmail.com`. GoTrue always receives the address **as typed** (trimmed, lowercased), never the normalised form.
- Identity keys are `hex(HMAC-SHA256(pepper, kind || ':' || value))` with `kind` ∈ `phone` (E.164), `email` (normalised), `google` (Google `sub`, i.e. `auth.identities.provider_id`). The pepper lives in `private.secrets`; no API role can read it. Plain emails and Google ids are never retained after deletion.
- **No new triggers on `auth.users`.** Change behaviour only by `create or replace` of `private.guard_auth_user()` and `private.scrub_auth_user()` (Plan 2's LAUNCH note: production `postgres` may not own `auth.users`).
- The literal `'pending'` review status appears **only inside `language plpgsql` function bodies** in this plan's migrations (no view, index predicate, constraint, SQL-language function or DML), so `alter type … add value` and its use can share one transaction in the production script.
- Every new `SECURITY DEFINER` function: `set search_path = ''`, `revoke execute … from public, anon, authenticated`, grant only the role that needs it; `admin_*` raise `not admin` unless `is_admin()` and write one `audit_log` row per write. Migrations are re-runnable (`if not exists`, `create or replace`, `on conflict do nothing`).
- Next.js 16: OAuth start is a server action; the callback is a route handler (`export async function GET(request: NextRequest)`); `cookies()` is async and writable there; `redirect()` is called outside `try`. Public pages still never call `cookies()`/`headers()`.
- Redirect targets after any sign-in pass through `safeNext()`; OAuth `redirectTo` is built from `NEXT_PUBLIC_SITE_URL`, never from the request's Host header.
- `CONSENT_TEXT_VERSION` stays `"2026-10-12"`: the consent text says nothing about how traders sign in (checked in Task 11).

## Review Focus

1. **Someone types their address every which way** ("  Sarah.Khan+bv@GoogleMail.com ", "sarahkhan@gmail.com") → one normalised key for limits, duplicate checks and retention; GoTrue gets `sarah.khan+bv@googlemail.com` as typed. Test in Task 2 (unit and pgTAP parity table).
2. **The email is slow and they tap "Send a new code" within a minute** → GoTrue answers 429; the person sees "Please wait a minute before asking for another code." and the code already sent still works. Test in Task 5.
3. **Google sign-in is cancelled, or the database refuses the new Google account** (its normalised Gmail already belongs to an email-code account) → the callback lands on the sign-in page with the Google error copy, never a 500 or a raw `Database error saving new user`. Test in Task 6.
4. **An email-only reviewer's review is approved while an automatic flag is open, or they edit it after approval** → approval yields `under_check`, not `published`; an edit puts it back to `pending`. Test in Task 8.
5. **A trader forwards their sign-in link and the wrong person opens it first** → the listing is linked once, the second opener sees "This link has already been used…", and the admin can unlink with a logged reason and issue a new link. Test in Task 9.

---

## File Structure

```
supabase/migrations/
  20261012000018_disposable_email_domains.sql  blocked_email_domains + seed, normalise_email, email_domain_blocked
  20261012000019_email_google_sign_in.sql      email_requests, email_gate/approve/record, email_verify_gate,
                                               sign_in_kind, guard_auth_user + scrub_auth_user bodies, my_account
  20261012000020_identity_retention.sql        private.secrets pepper, identity_keys, identity_retention (+backfill),
                                               delete_my_account, review_block_reason, phone_signed_in body
  20261012000021_held_reviews.sql              enum value 'pending', submit/edit_review, admin queue + approve
  20261012000022_trader_links.sql              trader_link_tokens, admin_new_trader_link, trader_link_preview,
                                               claim_trader_link, admin_unlink_provider, unlink trigger body, admin_get_provider
supabase/tests/ email_rules / email_accounts / identity_retention / held_reviews / trader_links .test.sql
supabase/templates/sign-in-code.html          the one email template (local, CI and pasted into production)
supabase/config.toml  scripts/local-stack/{start.sh,mail-sink.mjs,README.md,smoke.test.sh}
scripts/{db-reset.sh,e2e-prepare.sh,disposable-domains-sql.mjs,build-production-sql.mjs,check-production-sql.sh}
lib/ sign-in-methods.ts  email.ts  disposable-email-domains.json  email-gate.ts  google-callback.ts
     otp-gate.ts (phone_off copy)  review-form.ts  account-text.ts  auth.ts (Account fields)
app/platform/ sign-in/{page,actions}  auth/callback/route.ts  link/[token]/{page,actions}  account/{page}
              account/deleted/page.tsx  provider/page.tsx  p/[slug]/review/actions.ts
app/api/auth/sms-hook/route.ts
app/admin/(protected)/ reviews/{page,actions}  page.tsx  providers/{actions.ts,[id]/page.tsx}
components/auth/{GoogleButton,EmailCodeForm}.tsx  components/admin/{ProviderForms,PendingReviewCard}.tsx
app/(info)/ privacy, terms, review-policy, fake-reviews-policy, how-ratings-work   components/site/content.ts
proxy.ts  .env.example  playwright.config.ts  .github/workflows/ci.yml  README.md  docs/launch/{LAUNCH.md,plan-2b-production.sql}
e2e/helpers/{mailbox,email}.ts  e2e/{sign-in-email,sign-in-google,trader-link}.spec.ts  e2e/sign-in.spec.ts → sign-in-phone.spec.ts
tests/unit/ sign-in-methods, email, disposable-parity, email-gate, google-callback, email-sign-in-actions,
            sms-hook-route, trader-link-actions, held-review (+ existing review-form, no-stale-claims, sign-in-actions)
```

---

### Task 1: Phone sign-in switch (`SIGN_IN_PHONE`)

**Files:**
- Create: `lib/sign-in-methods.ts`, `tests/unit/sign-in-methods.test.ts`, `tests/unit/sms-hook-route.test.ts`
- Modify: `app/api/auth/sms-hook/route.ts`, `app/platform/sign-in/actions.ts`, `app/platform/sign-in/page.tsx`, `lib/otp-gate.ts`, `tests/unit/sign-in-actions.test.ts`, `.env.example`, `playwright.config.ts`

**Interfaces:**
- Produces:
  - `phoneSignInEnabled(env?: Record<string, string | undefined>): boolean` — `env.SIGN_IN_PHONE?.trim().toLowerCase() === "on"`; default `process.env`.
  - `SIGN_IN_ERRORS.phone_off` = "Sign-in by text is switched off. Please continue with Google or use an email code."
  - `requestCode`/`verifyCode` return `{ step: "phone", next, error: SIGN_IN_ERRORS.phone_off }` without calling Supabase when off.
  - `POST /api/auth/sms-hook` when off: 403, body `{ error: { http_code: 403, message: "Phone sign-in is switched off" } }`, `Cache-Control: no-store`, checked **before** the signature and before any RPC.
  - The sign-in page renders the phone form only when on (Task 5 adds the other methods).
  - `.env.example`: `SIGN_IN_PHONE=off` with comment "on = show phone sign-in (needs Twilio, see README). Anything else = off." `playwright.config.ts` sets `webServer.env = { ...process.env, SIGN_IN_PHONE: "on" }` **for now** (Task 10 flips it).

- [ ] **Step 1: Write failing tests:** `phoneSignInEnabled({SIGN_IN_PHONE:"on"})`, `(" ON ")` → true; `({})`, `("off")`, `("1")`, `("true")` → false. Route test (mock `@/lib/supabase/service`): with `SIGN_IN_PHONE` unset, a correctly signed hook body → 403 with the message above and `rpc` not called; with `on` → existing behaviour (signature check runs). Actions: with `vi.stubEnv("SIGN_IN_PHONE","off")`, `requestCode` returns the `phone_off` copy and `signInWithOtp`/`otp_gate` are not called; existing phone tests stub `on`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement. **Step 4:** `npm test && npm run test:e2e` → PASS.
- [ ] **Step 5:** Commit `feat: SIGN_IN_PHONE switch; SMS hook refuses when phone sign-in is off`.

---

### Task 2: Email address rules — normalisation and disposable domains

**Files:**
- Create: `lib/email.ts`, `lib/disposable-email-domains.json`, `scripts/disposable-domains-sql.mjs`, `supabase/migrations/20261012000018_disposable_email_domains.sql`, `supabase/tests/email_rules.test.sql`, `tests/unit/email.test.ts`, `tests/unit/disposable-parity.test.ts`

**Interfaces:**
- Produces:
  - `lib/disposable-email-domains.json`: `{ "source": "https://github.com/disposable-email-domains/disposable-email-domains (CC0)", "fetched": "2026-10-12", "domains": [ …sorted, lowercase… ] }` — a snapshot of `disposable_email_blocklist.conf`, minus any domain in the never-block list below.
  - `normaliseEmail(input: string): string | null` — null unless, after trimming, it is ≤ 254 chars and matches `^[^\s@]+@[^\s@]+\.[^\s@]+$`; rules per Global Constraints.
  - `emailDomain(input: string): string | null` — the lowercased part after the last `@`.
  - `isDisposableDomain(domain: string, list?: ReadonlySet<string>): boolean` — true when the domain **or any parent domain** (`a.b.mailinator.com` → `b.mailinator.com` → `mailinator.com`) is listed.
  - `scripts/disposable-domains-sql.mjs` prints an idempotent SQL block (`insert into public.blocked_email_domains (domain) values … on conflict do nothing;`) from the JSON. A refreshed list ships as a new migration generated by this script.
  - Migration 000018: table `public.blocked_email_domains(domain text primary key check (domain = lower(domain) and domain !~ '\s'), added_at timestamptz not null default now())`, RLS on, no grants; the generated seed; `private.normalise_email(p text) returns text` (immutable, same rules, null when invalid); `private.email_domain_blocked(p_email text) returns boolean` (domain or any parent listed).

- [ ] **Step 1: Write failing unit tests** (`email.test.ts`), **Review Focus 1:** `normaliseEmail` maps `"  Sarah.Khan+bv@GoogleMail.com "` and `"sarahkhan@gmail.com"` → `"sarahkhan@gmail.com"`; `"Jo.Bloggs+x@Outlook.com"` → `"jo.bloggs@outlook.com"` (dots kept outside Gmail); `""`, `"no-at-sign"`, `"a@b"`, `"a b@c.com"`, a 255-char address → null. `isDisposableDomain("mailinator.com")`, `("x.mailinator.com")` → true; never-block list `gmail.com`, `googlemail.com`, `outlook.com`, `hotmail.co.uk`, `hotmail.com`, `live.co.uk`, `yahoo.co.uk`, `yahoo.com`, `icloud.com`, `me.com`, `btinternet.com`, `sky.com`, `virginmedia.com`, `talktalk.net`, `aol.com`, `protonmail.com`, `proton.me`, `ysbdesigns.uk` → false.
- [ ] **Step 2: Write the failing parity test** `disposable-parity.test.ts`: the domains inserted by the newest migration whose filename contains `disposable_email_domains` equal the JSON's `domains` exactly (parse the `values ('…')` tuples); the JSON is sorted, lowercased, unique.
- [ ] **Step 3: Write failing pgTAP** (`email_rules.test.sql`): `private.normalise_email` returns the same output as the unit test for each case above (same literal table); `private.email_domain_blocked('a@x.mailinator.com')` true, `('a@gmail.com')` false; `anon`/`authenticated` cannot `select` from `blocked_email_domains` (`42501`).
- [ ] **Step 4:** `npm test && npm run db:reset && npm run test:db` → FAIL. **Step 5:** fetch the list, write JSON, generate and write the migration. **Step 6:** PASS.
- [ ] **Step 7:** Commit `feat: email normalisation and disposable-domain block list (repo + database)`.

---

### Task 3: Email and Google accounts in the database

**Files:**
- Create: `supabase/migrations/20261012000019_email_google_sign_in.sql`, `supabase/tests/email_accounts.test.sql`
- Modify: `supabase/tests/phone_guard.test.sql` (expected messages only, if any change)

**Interfaces:**
- Consumes: Task 2 `private.normalise_email`, `private.email_domain_blocked`; Plan 2 `otp_verify_attempts`, `otp_verify_record`, `settings.otp_verify_limits`, `private.random_password_hash()`.
- Produces:
  - Setting `email_limits` = `{"address_15m":3,"address_24h":6,"ip_1h":10,"ip_24h":20,"daily_cap":90,"monthly_cap":2900}`.
  - Table `public.email_requests(id bigint identity pk, email_norm text not null, ip_hash text not null, outcome text not null default 'pending' check (outcome in ('pending','invalid','limited_address','limited_ip','cap_reached','blocked_domain','address_taken','admin_address','approved','sent','send_failed')), nonce_hash text, consumed_at timestamptz, created_at timestamptz not null default now())`; indexes `(email_norm, created_at)`, `(ip_hash, created_at)`, `(created_at)`, unique `(nonce_hash) where nonce_hash is not null`; RLS on, no grants.
  - `public.email_gate(p_email text, p_ip_hash text) returns table (request_id bigint, verdict text)` (service_role). Advisory lock on the normalised address; deletes rows older than 35 days; checks in this order, recording the first hit as the row's outcome: `invalid` (normalise null) · `admin_address` (address in `settings.admin_emails`) · `blocked_domain` · `address_taken` (a live `auth.users` row with the same normalised email but a different `lower(email)`) · `address_limited` · `ip_limited` · `cap_reached` (`sent` rows this London day ≥ `daily_cap` or this London month ≥ `monthly_cap`). Verdict `ok` inserts `pending`.
  - `public.email_approve(p_request_id bigint, p_nonce_hash text) returns void` and `public.email_record(p_request_id bigint, p_outcome text) returns void` (service_role) — same contracts as `otp_approve`/`otp_record` (approve only from `pending`, nonce hash `^[0-9a-f]{64}$`; record refuses `approved`).
  - `private.code_verify_gate(p_subject text, p_ip_hash text) returns table (attempt_id bigint, verdict text)` — the body of today's `otp_verify_gate` (also purging `identity_retention` from Task 7 once that table exists — Task 7 re-creates this function), verdicts `ok` / `subject_locked` / `ip_locked`. `public.otp_verify_gate(p_phone, p_ip_hash)` becomes a wrapper mapping `subject_locked` → `number_locked`. New `public.email_verify_gate(p_email text, p_ip_hash text)` (service_role) calls it with subject `'email:' || normalise_email(p_email)` and maps → `address_locked`. Wrong codes from one IP count across phone and email.
  - `private.sign_in_kind(p_uid uuid) returns text` — `admin` (email in `admin_emails`), else `google` (an `auth.identities` row with `provider = 'google'`), else `phone` (phone set and `phone_confirmed_at` not null), else `email` (email set and `email_confirmed_at` not null), else null (also for `is_anonymous`).
  - `private.guard_auth_user()` (new body; triggers untouched). INSERT rules: `deleted_at` set → allow · phone non-empty → unchanged from 000011 · email non-empty and in `admin_emails` → allow (unchanged) · `raw_app_meta_data->>'provider' = 'google'` → refuse `email already registered` (`unique_violation`) when another live user has the same normalised email; set `encrypted_password := private.random_password_hash()`; allow · other email → require a `bv_nonce` matching an `approved`, unconsumed `email_requests` row for the normalised address from the last 15 minutes (`email sign-up not approved`), `email_confirmed_at` null (`email sign-up must be confirmed by code`), not `private.email_domain_blocked` (`email domain not allowed`), not taken (`email already registered`); consume the row, strip `bv_nonce`, random password hash · neither → allow (bare-id fixtures). UPDATE OF phone: unchanged.
  - `private.scrub_auth_user()` (new body): strips `bv_nonce`; for live accounts whose `sign_in_kind` is not `admin`, any change to `encrypted_password` (and phone confirmation of phone-only accounts, as before) is replaced by a random hash; setting `email_change` to a non-empty value raises `email changes are not supported` unless `admin`.
  - `public.my_account()` keeps its shape and adds `sign_in_kind` (text) and `email` (text or null).

- [ ] **Step 1: Write failing pgTAP tests** (`email_accounts.test.sql`, superuser + `set local role service_role` where needed):
  - `email_gate` ordering: `'not-an-email'` → `invalid`; an `admin_emails` address → `admin_address`; `x@mailinator.com` → `blocked_domain`; with live user `sarah.khan@gmail.com`, `'sarahkhan@gmail.com'` → `address_taken` and `'Sarah.Khan@gmail.com'` → `ok`; 3 × `ok` then `address_limited` for one address (also via `+tag` variants); 10 × `ok` from one IP across addresses then `ip_limited`; with 90 `sent` rows today → `cap_reached`; 89 today plus 2,000 earlier this month → `ok`; rows older than 35 days deleted. `anon`/`authenticated` cannot execute `email_gate`, `email_approve`, `email_record`, `email_verify_gate` (`42501`).
  - Guard: `insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)` with provider `email` and no nonce → `email sign-up not approved`; with the nonce of an approved row → succeeds, row `consumed_at` set, `bv_nonce` gone, `encrypted_password` starts `$2`; reusing the nonce → refused; a 16-minute-old approval → refused; `email_confirmed_at = now()` on insert → `email sign-up must be confirmed by code`; a blocked domain with a valid nonce → `email domain not allowed`. Provider `google` insert with no nonce → succeeds; a second Google insert whose normalised email matches a live user → `email already registered`. Password sign-up (`encrypted_password` set, provider `email`, no nonce) → refused. Admin allow-listed email → succeeds (unchanged).
  - Scrub: `update auth.users set encrypted_password = 'x'` on an email-code account → stored value is a fresh bcrypt hash, not `'x'`; same update on the admin → kept; `update … set email_change = 'new@example.com'` on an email-code account → `email changes are not supported`.
  - `private.sign_in_kind`: admin / google (identity row inserted) / phone / email / null (unconfirmed email) cases; an email account that later gains a `google` identity → `google`.
  - `email_verify_gate`: 5 wrong for one address (any `+tag` variant) → `address_locked`; `otp_verify_gate` still answers `number_locked` after 5 wrong for a phone; 20 wrong from one IP split across phone and email → `ip_locked` for both.
- [ ] **Step 2:** `npm run db:reset && npm run test:db` → FAIL. **Step 3:** implement. **Step 4:** PASS (all Plan 2 pgTAP files still pass).
- [ ] **Step 5:** Commit `feat(db): email-code and Google accounts behind the auth.users guard`.

---

### Task 4: Local inbox, email template and Google stub (local stack and CI)

**Files:**
- Create: `scripts/local-stack/mail-sink.mjs`, `supabase/templates/sign-in-code.html`, `e2e/helpers/mailbox.ts`, `tests/unit/auth-email-config.test.ts`
- Modify: `supabase/config.toml`, `scripts/local-stack/start.sh`, `scripts/local-stack/stop.sh`, `scripts/local-stack/README.md`, `scripts/local-stack/smoke.test.sh`, `scripts/db-reset.sh`, `supabase/tests/fixtures/e2e.sql`

**Interfaces:**
- Produces:
  - **Which inbox CI has:** run `npx supabase start && npx supabase status` once. If it lists Mailpit, the shared API is Mailpit's (`GET /api/v1/search?query=to:"<addr>"` → `{ messages: [{ ID, Created }] }` newest first; `GET /api/v1/message/<ID>` → `{ Text, HTML, Subject }`; `DELETE /api/v1/messages`). If it lists Inbucket, use Inbucket's (`GET /api/v1/mailbox/<local-part>`, `GET /api/v1/mailbox/<local-part>/<id>` → `{ body: { text } }`). Record which in `scripts/local-stack/README.md`; both the sink and the helper implement only that one.
  - `mail-sink.mjs`: dependency-free Node SMTP sink on `127.0.0.1:54325` (EHLO/HELO, MAIL, RCPT, DATA, RSET, NOOP, QUIT; no AUTH, no STARTTLS) keeping messages in memory, and an HTTP server on `127.0.0.1:54324` serving the chosen inbox API subset plus `GET /templates/sign-in-code.html` (the repo file, for GoTrue's template URLs). Started and stopped by `start.sh`/`stop.sh` like the other local services.
  - `sign-in-code.html`: heading "Your sign-in code", the code in a large monospace block via `{{ .Token }}`, "It expires in 15 minutes. If you didn't ask for it, ignore this email.", footer "Bolton Vouched · boltonvouched.ysbdesigns.uk". No links, no `{{ .ConfirmationURL }}`.
  - `config.toml`: `[auth.email] enable_confirmations = true`, `otp_length = 6`, `otp_expiry = 900`, `max_frequency = "1s"`; `[auth.email.template.confirmation]` and `[auth.email.template.magic_link]` both `subject = "Your Bolton Vouched sign-in code"`, `content_path = "./supabase/templates/sign-in-code.html"`; `[auth.external.google] enabled = true`, `client_id = "local-dummy.apps.googleusercontent.com"`, `secret = "local-dummy-not-a-secret"`, `skip_nonce_check = false` (comment: never `supabase config push`).
  - `start.sh` GoTrue env: `GOTRUE_MAILER_AUTOCONFIRM=false`, `GOTRUE_SMTP_HOST=127.0.0.1`, `GOTRUE_SMTP_PORT=54325`, `GOTRUE_SMTP_ADMIN_EMAIL=noreply@ysbdesigns.uk`, `GOTRUE_SMTP_SENDER_NAME="Bolton Vouched"`, `GOTRUE_MAILER_OTP_LENGTH=6`, `GOTRUE_MAILER_OTP_EXP=900`, `GOTRUE_SMTP_MAX_FREQUENCY=1s`, `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` and `…_MAGIC_LINK=http://127.0.0.1:54324/templates/sign-in-code.html`, `GOTRUE_MAILER_SUBJECTS_CONFIRMATION` and `…_MAGIC_LINK="Your Bolton Vouched sign-in code"`, `GOTRUE_EXTERNAL_GOOGLE_ENABLED=true`, `…_CLIENT_ID`, `…_SECRET` (the dummies), `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=http://127.0.0.1:54321/auth/v1/callback`.
  - E2E test addresses use the domain `residents.example.test` (constant `E2E_EMAIL_DOMAIN` in `e2e/helpers/mailbox.ts`). `db-reset.sh` also deletes `auth.users` whose email ends `@residents.example.test`. If GoTrue rejects `.test` addresses on `/otp`, switch the constant and the reset filter together to `residents.example.com`.
  - `e2e.sql` sets `email_limits` to `{"address_15m":50,"address_24h":200,"ip_1h":1000,"ip_24h":5000,"daily_cap":5000,"monthly_cap":50000}`.
  - `latestCode(email: string, after: Date): Promise<string>` — polls the inbox (250 ms, 15 s timeout) for the newest message to `email` created after `after`, returns the first `\b\d{6}\b` in its text; throws with the inbox URL on timeout.

- [ ] **Step 1: Write the failing config test** `auth-email-config.test.ts`: `config.toml` and `start.sh` agree on OTP length 6, expiry 900, both template subjects, `enable_confirmations = true` ↔ `GOTRUE_MAILER_AUTOCONFIRM=false`, Google enabled in both; the template contains `{{ .Token }}` and not `ConfirmationURL` or `href=`.
- [ ] **Step 2: Extend `smoke.test.sh`** (both stacks): `POST /auth/v1/otp {"email":"smoke@residents.example.test","create_user":true}` with no nonce → non-200 and no `auth.users` row; insert an approved `email_requests` row whose `nonce_hash` is `sha256('smoke-nonce')`, then `POST /auth/v1/otp` with `"data":{"bv_nonce":"smoke-nonce"}` → 200; a message reaches the inbox within 10 s; `POST /auth/v1/verify {"type":"email","email":…,"token":<code>}` → 200 with `access_token`; `POST /auth/v1/signup {"email":"pw@residents.example.test","password":"xxxxxxxx"}` → non-200; `GET /auth/v1/authorize?provider=google` → 302 whose `Location` starts `https://accounts.google.com/` and contains `client_id=local-dummy`. Clean up.
- [ ] **Step 3:** `npm test` and `npm run stack:stop && npm run stack:start && npm run test:stack` → FAIL. **Step 4:** implement. **Step 5:** both PASS; `npm run test:e2e` still PASS; CI green.
- [ ] **Step 6:** Commit `chore: local inbox, sign-in code template and Google stub for local and CI`.

---

### Task 5: Email-code sign-in

**Files:**
- Create: `lib/email-gate.ts`, `components/auth/EmailCodeForm.tsx`, `tests/unit/email-gate.test.ts`, `tests/unit/email-sign-in-actions.test.ts`, `e2e/helpers/email.ts`, `e2e/sign-in-email.spec.ts`
- Modify: `app/platform/sign-in/actions.ts`, `app/platform/sign-in/page.tsx`, `lib/auth.ts` (`Account` gains `signInKind: "google" | "email" | "phone" | "admin" | null; email: string | null`)

**Interfaces:**
- Consumes: Task 2 `normaliseEmail`, `emailDomain`, `isDisposableDomain`; Task 3 `email_gate`, `email_approve`, `email_record`, `email_verify_gate`, `otp_verify_record`; `ipHash`, `clientIpFrom`, `safeNext`, `welcomePath`.
- Produces:
  - `EMAIL_SIGN_IN_ERRORS` (exact copy): `invalid` "Enter your email address, like name@example.com." · `blocked_domain` "Please use your own email address. Temporary or throwaway addresses can't sign in." · `address_limited` "Too many codes for this address. Please wait 15 minutes and try again." · `ip_limited` "Too many sign-in attempts from this connection. Please try again in an hour." · `cap_reached` "Sign-in emails are paused for today. Please try again tomorrow, or continue with Google." · `address_taken` "There's already an account for this address. Use the exact address you signed up with, or continue with Google." · `admin_address` "This address can't sign in here." · `too_soon` "Please wait a minute before asking for another code." · `send_failed` "We couldn't send the email just now. Please try again in a minute." · `gate_failed` "We couldn't start sign-in just now. Please try again in a minute." · `bad_code` "That code didn't work. Check the email and try again, or send a new code." · `code_address_locked` "Too many wrong codes for this address. Please wait 15 minutes, then send yourself a new code." · `code_ip_locked` "Too many wrong codes from this connection. Please try again in an hour." · `verify_failed` "We couldn't check your code just now. Please try again in a minute."
  - `type EmailGateDeps = { gate(email: string, ipHash: string): Promise<{ requestId: number; verdict: string }>; approve(id: number, nonceHash: string): Promise<void>; record(id: number, outcome: "sent" | "send_failed"): Promise<void>; send(email: string, nonce: string): Promise<{ error: { status?: number; message?: string } | null }> }`
  - `requestEmailSignInCode(input: string, ip: string, deps: EmailGateDeps): Promise<{ ok: true; email: string } | { ok: false; error: string }>` — order: `normaliseEmail` (null → `invalid`) → `isDisposableDomain(emailDomain)` (→ `blocked_domain`, no gate call) → gate (non-`ok` verdict → its copy; unknown verdict or throw → `gate_failed`) → approve with `sha256(nonce)` of a fresh 32-byte base64url nonce → send the trimmed, lowercased address as typed → record. Send error with `status === 429` → `too_soon`, other → `send_failed`. Returns the address as sent.
  - Actions in `app/platform/sign-in/actions.ts`: `type EmailSignInState = { step: "email" | "code"; email?: string; next: string; error?: string }`; `requestEmailCode(prev: EmailSignInState, fd: FormData)` (fields `email`, `next`) calls `signInWithOtp({ email, options: { shouldCreateUser: true, data: { bv_nonce } } })` on the cookie client; `verifyEmailCode(prev, fd)` (fields `email`, `code`, `next`): `email_verify_gate` → `verifyOtp({ email, token, type: "email" })` → `otp_verify_record` → `my_account` → `redirect(welcomePath(next))` without a finished profile, else `redirect(next)`. No `claim_provider_listings` call.
  - `EmailCodeForm` (client): step 1 label "Your email address" (`type="email" autoComplete="email" inputMode="email"`), button "Email me a code"; step 2 text "We've sent a 6-digit code to **{email}**. It can take a minute — check your spam folder too.", label "6-digit code" (`inputMode="numeric" autoComplete="one-time-code"`), buttons "Sign in", "Send a new code", "Use a different address".
  - Sign-in page: default heading "Sign in to Bolton Vouched" (the existing review/report/reply headings stay); order: Google button (Task 6 slot), divider "or", `EmailCodeForm`, then the phone form only when `phoneSignInEnabled()`. Reassurance lines: "Your email address is only used to sign you in. It's never shown on the site." and the existing "Looking and calling never needs an account…".
  - `e2e/helpers/email.ts`: `signInWithEmail(page: Page, email: string, opts?: { first?; surname?; district?; groupCode?; next? }): Promise<void>` (same Welcome handling as `signInWithPhone`); `markAsGoogle(email: string): Promise<void>` inserts an `auth.identities` row (`provider 'google'`, `provider_id 'e2e-sub-' || user id`, `identity_data jsonb_build_object('sub', …, 'email', email)`) via `psql "$SUPABASE_DB_URL"`; `signInAsGoogle(page, email, opts)` = `signInWithEmail` then `markAsGoogle` (the same state as an email account that later linked Google).

- [ ] **Step 1: Write failing unit tests** `email-gate.test.ts` (fake deps): invalid → `invalid` copy, gate not called; `x@mailinator.com` → `blocked_domain`, gate not called; each non-`ok` verdict → its copy and `send` not called; gate throwing → `gate_failed`; ok → `approve(id, <64 hex>)` then `send("sarah.khan+bv@googlemail.com", nonce)` for input `"  Sarah.Khan+bv@GoogleMail.com "` (as typed, lowercased) then `record(id,"sent")`. **Review Focus 2:** `send` → `{ error: { status: 429 } }` → `record(id,"send_failed")` and the `too_soon` copy.
- [ ] **Step 2: Write failing action tests** `email-sign-in-actions.test.ts` (mock `@/lib/supabase/server`, `@/lib/supabase/service`, `next/headers`, `next/navigation`): `verifyEmailCode` with verdict `address_locked` → its copy and `verifyOtp` not called; wrong code → `bad_code` and `otp_verify_record(…, false)`; right code, no profile → redirect `/platform/welcome?next=%2Fplatform%2Fp%2Face%2Freview`; right code with profile and `next=//evil.example` → redirect `/platform/account`; `verifyOtp` called with `type: "email"`.
- [ ] **Step 3: Write failing E2E** `sign-in-email.spec.ts`: fill `sarah@residents.example.test` → "We've sent a 6-digit code to sarah@residents.example.test" → `latestCode` → Sign in → Welcome → `Sarah`/`Khan`/`BL3` → account page "Signed in as Sarah K."; wrong code `000000` → `bad_code` copy; `x@mailinator.com` → blocked copy; the page shows the "or" divider above the email form, and the phone form below it (the E2E server still runs with phone on until Task 10).
- [ ] **Step 4:** `npm test && npm run test:e2e` → FAIL. **Step 5:** implement. **Step 6:** PASS.
- [ ] **Step 7:** Commit `feat: sign in with a 6-digit email code`.

---

### Task 6: Continue with Google

**Files:**
- Create: `lib/google-callback.ts`, `app/platform/auth/callback/route.ts`, `components/auth/GoogleButton.tsx`, `tests/unit/google-callback.test.ts`, `tests/unit/google-sign-in-action.test.ts`, `e2e/sign-in-google.spec.ts`
- Modify: `app/platform/sign-in/actions.ts`, `app/platform/sign-in/page.tsx`, `proxy.ts`, `app/globals.css` (standalone hint)

**Interfaces:**
- Consumes: `safeNext`, `welcomePath`, `createServerAuthClient`, `NEXT_PUBLIC_SITE_URL`.
- Produces:
  - `GOOGLE_SIGN_IN_ERROR` (exported from `lib/google-callback.ts`) = "We couldn't sign you in with Google. Please try again, or use an email code." Shown on the sign-in page when `?error=google`.
  - `startGoogleSignIn(fd: FormData): Promise<void>` (field `next`): `signInWithOAuth({ provider: "google", options: { redirectTo: \`${NEXT_PUBLIC_SITE_URL}/platform/auth/callback?next=${encodeURIComponent(safeNext(next))}\`, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } } })` on the cookie client (stores the PKCE verifier cookie); error or no `data.url` → `redirect("/platform/sign-in?error=google&next=…")`; else `redirect(data.url)`.
  - `googleCallbackPath(params: { code: string | null; error: string | null; next: string | null }, deps: { exchange(code: string): Promise<boolean>; account(): Promise<{ display_name: string | null; deleted: boolean } | null> }): Promise<string>` — `error` set or no `code` → `/platform/sign-in?error=google&next=<safeNext(next)>`; exchange false or throwing → same; no finished profile or deleted → `welcomePath(safeNext(next))`; else `safeNext(next)`.
  - `GET /platform/auth/callback`: `export const dynamic = "force-dynamic"`; reads `code`, `error`, `next` from `request.nextUrl.searchParams`; `exchange` = `exchangeCodeForSession(code)` on `createServerAuthClient()`; `account` = `rpc("my_account")`; returns `NextResponse.redirect(new URL(path, NEXT_PUBLIC_SITE_URL), 303)` with `Cache-Control: private, no-store`.
  - `proxy.ts` matcher adds `"/platform/auth/callback"` and `"/platform/link/:path*"` (Task 9 route).
  - `GoogleButton`: a `<form action={startGoogleSignIn}>` with hidden `next` and a button "Continue with Google" (Google "G" mark inline SVG); under it `<p className="standalone-only">Using the app from your home screen? The email code works without leaving the app.</p>`, shown only by `@media (display-mode: standalone)`.

- [ ] **Step 1: Write failing unit tests:** **Review Focus 3:** `googleCallbackPath({code:null, error:"access_denied", next:"/platform/p/ace/review"})` → `/platform/sign-in?error=google&next=%2Fplatform%2Fp%2Face%2Freview`; `error:"server_error"` (the guard's "Database error saving new user") → same; exchange false → same; exchange throwing → same; ok + no profile → `/platform/welcome?next=…`; ok + profile + `next:"https://evil.example"` → `/platform/account`. Action test: `signInWithOAuth` called with provider `google`, `redirectTo` `http://localhost:3000/platform/auth/callback?next=%2Fplatform%2Faccount` for `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, `skipBrowserRedirect: true`; `redirect` called with the returned URL; an `error` → redirect to the sign-in error path. Route test: response status 303, `Location` absolute on the site URL, `Cache-Control` `private, no-store`.
- [ ] **Step 2: Write failing E2E** `sign-in-google.spec.ts`: `page.route("https://accounts.google.com/**", r => r.abort())`, click "Continue with Google", assert the aborted request URL contains `client_id=local-dummy.apps.googleusercontent.com` and a `redirect_uri` ending `/auth/v1/callback`, and that a `sb-…-code-verifier` cookie exists for localhost; `GET /platform/auth/callback?error=access_denied&next=/platform/account` → lands on `/platform/sign-in` showing the Google copy; the `.standalone-only` hint is in the DOM and hidden in a normal tab.
- [ ] **Step 3:** FAIL. **Step 4:** implement. **Step 5:** `npm test && npm run test:e2e` → PASS.
- [ ] **Step 6:** Commit `feat: continue with Google (PKCE, callback route)`.

---

### Task 7: Hashed identity keys and retention

**Files:**
- Create: `supabase/migrations/20261012000020_identity_retention.sql`, `supabase/tests/identity_retention.test.sql`
- Modify: `supabase/tests/review2_minors.test.sql` (email-only accounts may now review; admin still may not), `supabase/tests/account_deletion.test.sql`

**Interfaces:**
- Consumes: Task 3 `private.sign_in_kind`, `private.normalise_email`, `private.code_verify_gate`; Plan 2 `phone_retention`, `delete_my_account` (000016 body), `review_block_reason` (000016 body).
- Produces:
  - `private.secrets(key text primary key, value bytea not null)`; row `identity_pepper` = `extensions.gen_random_bytes(32)` inserted `on conflict do nothing` (so a re-run never changes it). Revoke all from `public, anon, authenticated, service_role`.
  - `private.identity_key(p_kind text, p_value text) returns text` and `private.identity_keys(p_uid uuid) returns text[]` — keys for: confirmed phone (`phone`, `'+' || ltrim(phone,'+')`), confirmed email (`email`, normalised), each `google` identity (`provider_id`). Empty array for none.
  - `public.identity_retention(id bigint identity pk, user_id uuid not null, identity_key text not null, deleted_at timestamptz not null default now(), purge_after timestamptz not null default now() + interval '12 months')`; indexes on `identity_key`, `user_id`, `purge_after`; RLS on; revoke all incl. `service_role`. Backfill one row per existing `phone_retention` row (`identity_key('phone', phone_e164)`, same `user_id`, `deleted_at`, `purge_after`), skipping ones already present.
  - `delete_my_account()` — the 000016 body plus: purge `identity_retention` past `purge_after`; insert one row per key of `identity_keys(v_uid)` not already retained for this user (before the Auth soft delete obfuscates them). `phone_retention` behaviour for phone accounts is unchanged.
  - `private.review_block_reason(p_uid, p_provider)` — the 000016 body with both `phone_retention` lookups replaced by `identity_retention ir where ir.identity_key = any(private.identity_keys(p_uid)) and ir.user_id <> p_uid and ir.purge_after > now()` (blocked → `blocked`; an earlier account's for-cause removal of this provider → `removed_before`).
  - `private.phone_signed_in(p_uid)` keeps its name and signature (callers: `review_block_reason`, `report_review`, `provider_reply`) with body `select p_uid is not null and coalesce(private.sign_in_kind(p_uid), '') in ('google', 'email', 'phone')` and a comment saying so.
  - `private.code_verify_gate` re-created to also `delete from public.identity_retention where purge_after < now()`.

- [ ] **Step 1: Write failing pgTAP tests:**
  - Keys: an email account `Sarah.Khan+x@gmail.com` and a later account `sarahkhan@gmail.com` share a key; a Google account's keys include `google:<sub>` and its email; keys are 64 hex and differ from a plain `sha256` of the same text; `authenticated` and `service_role` cannot select `identity_retention` or `private.secrets`.
  - Removal survives re-signup: a Google user's review of P is removed for cause, they delete their account → new Google user with the same `sub` (different email) gets `removed_before` for P and may review Q; same for an email user re-signing with a dot-variant Gmail; a removal reason `Reviewer deleted their account` does not count; after `update identity_retention set purge_after = now() - interval '1 day'` the new account may review P.
  - Blocked survives: an earlier account on the same key with `blocked_at` → `blocked`.
  - Backfill: a `phone_retention` row present before the migration has a matching `identity_retention` row.
  - `phone_signed_in`: true for google, email and phone kinds; false for the admin and for an unconfirmed email account.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS (all pgTAP files).
- [ ] **Step 5:** Commit `feat(db): hashed sign-in identity keys; removal and blocks survive re-signup for every method`.

---

### Task 8: Held reviews for email-only accounts

**Files:**
- Create: `supabase/migrations/20261012000021_held_reviews.sql`, `supabase/tests/held_reviews.test.sql`, `components/admin/PendingReviewCard.tsx`, `tests/unit/held-review.test.ts`
- Modify: `lib/review-form.ts`, `app/platform/p/[slug]/review/actions.ts`, `app/platform/account/page.tsx` (status label), `app/admin/(protected)/reviews/page.tsx`, `app/admin/(protected)/reviews/actions.ts`, `app/admin/(protected)/page.tsx`, `app/admin/(protected)/layout.tsx` (nav count), `tests/unit/review-form.test.ts`, `tests/unit/moderation-actions.test.ts`, `e2e/review.spec.ts`, `e2e/moderation.spec.ts`

**Interfaces:**
- Consumes: Task 3 `private.sign_in_kind`; Plan 2 `submit_review`/`edit_review` (000013 bodies), `admin_set_review_status`, `admin_counts`, `private.admin_review_json`, `run_review_flags`.
- Produces:
  - `alter type public.review_status add value if not exists 'pending';` (first statement).
  - `submit_review(p_uid, p, p_device_hash)` — inserts with `status = case when private.sign_in_kind(v_uid) = 'email' then 'pending' else 'published' end`; then `run_review_flags` as before (flags are recorded for pending reviews; only `published` flips to `under_check`). Returns `{id, status}`.
  - `edit_review(…)` — after the update, if `sign_in_kind = 'email'` and status is `published` or `under_check`, set `pending`.
  - `admin_counts()` adds `"pending"`; `public.admin_list_reviews_pending() returns jsonb` — same item shape as `admin_list_reviews_under_check` (including open `flags`) plus `sign_in_kind`, oldest first.
  - `admin_set_review_status` adds: `pending → published` (action `approve_review`; becomes `under_check` instead when the review has an open `auto` flag) and `pending → removed` (reason required, action `remove_review`, open flags resolved as for other removals). All other transitions unchanged.
  - `type ReviewStatus = "pending" | "published" | "under_check" | …`; `statusLabel("pending")` → `"Waiting for a quick check — it'll appear once approved"`; `ReviewFormState.status` gains `"pending"`; `posted()` maps it through.
  - Admin action `approveReview(prev: FormState, fd: FormData): Promise<FormState>` (field `review_id`) → `admin_set_review_status(id, 'published', null)`, then `revalidatePublicPages(slug)`; the existing `removeReview` handles pending removals.
  - Admin Reviews page: first section **"Reviews awaiting approval"** listing `PendingReviewCard`s (business, category, answers, comment, reviewer name, "Signed in with an email code", account age, other reviews count, open flags) with **Approve** and a **Remove** form (reason textarea, required); empty state "Nothing waiting." Admin home and nav show the pending count.

- [ ] **Step 1: Write failing pgTAP tests** (`held_reviews.test.sql`, users made through the Task 3 guard paths): an email account's review → `status = 'pending'`; not in `review_public`; `provider_public` score and count unchanged; a Google account's and a phone account's review → `published`; an email account that gains a google identity → next review `published` (its earlier pending one stays pending). **Review Focus 4:** approve with no open auto flag → `published` and an `approve_review` audit row; a pending review that tripped `burst_48h` → approve → `under_check`; an email account editing its approved review → `pending`; remove with blank reason → `check_violation`, with a reason → `removed` + `remove_review` audit row; `pending → under_check` directly → `transition not allowed`; non-admin calling `admin_list_reviews_pending` → `not admin`; `admin_counts()->>'pending'` counts them.
- [ ] **Step 2: Write failing unit tests:** `statusLabel("pending")` exact copy; `submitReview` with `rpc` returning `{status:"pending"}` → state `status: "pending"`; `approveReview` calls `admin_set_review_status` with `p_status: "published"` and revalidates the provider's page.
- [ ] **Step 3: Write failing E2E:** `review.spec.ts` — `signInWithEmail` resident reviews Ace Plumbing → result reads "Waiting for a quick check — it'll appear once approved"; the profile does not show the comment; account page lists it with the same label; a `signInAsGoogle` resident's review → "Published". `moderation.spec.ts` — admin sees it under "Reviews awaiting approval", clicks Approve → it appears on the profile; another is removed with reason "Spam" → gone from the queue and the account page shows it removed.
- [ ] **Step 4:** FAIL. **Step 5:** implement. **Step 6:** `npm run db:reset && npm run test:db && npm test && npm run test:e2e` → PASS.
- [ ] **Step 7:** Commit `feat: hold email-only accounts' reviews for admin approval`.

---

### Task 9: Trader sign-in links

**Files:**
- Create: `supabase/migrations/20261012000022_trader_links.sql`, `supabase/tests/trader_links.test.sql`, `app/platform/link/[token]/page.tsx`, `app/platform/link/[token]/actions.ts`, `tests/unit/trader-link-actions.test.ts`, `e2e/trader-link.spec.ts`
- Modify: `app/admin/(protected)/providers/actions.ts`, `app/admin/(protected)/providers/[id]/page.tsx`, `components/admin/ProviderForms.tsx`, `app/platform/provider/page.tsx`, `e2e/provider.spec.ts`

**Interfaces:**
- Consumes: Plan 2 `providers`, `profiles`, `audit_log`, `is_admin()`; Task 1 `phoneSignInEnabled`.
- Produces:
  - Table `public.trader_link_tokens(id uuid pk default gen_random_uuid(), provider_id uuid not null references providers, token_hash text not null unique, created_by uuid, created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '14 days', used_at timestamptz, used_by uuid, revoked_at timestamptz)`; RLS on, no grants. Tokens are `gen_random_uuid()` values; only `encode(sha256(token::text::bytea), 'hex')` is stored.
  - `public.admin_new_trader_link(p_provider uuid) returns jsonb` → `{token, expires_at}` (authenticated, admin): provider must be `consented`/`live`/`paused` with `user_id is null` (`listing_already_linked` / `provider not linkable`); revokes earlier unused tokens for that provider; audit `new_trader_link`.
  - `public.trader_link_preview(p_token uuid) returns jsonb` (authenticated) → `{state, business_name}` with `state` ∈ `ok`, `link_invalid`, `link_used`, `link_expired`, `listing_already_linked`, `account_already_linked`; `business_name` only when the token exists.
  - `public.claim_trader_link(p_token uuid) returns text` (authenticated): caller needs a live profile with a display name (`not_member`); locks the token row; raises the first of `link_invalid` (unknown, revoked, or provider not `consented`/`live`/`paused`), `link_used`, `link_expired`, `listing_already_linked`, `account_already_linked` (caller linked to any provider not `removed`); sets `providers.user_id`, role `provider` if `resident`, `used_at`/`used_by`; audit `claim_trader_link` (actor = caller); returns the slug.
  - `public.admin_unlink_provider(p_provider uuid, p_reason text) returns void` (admin): reason required; clears `user_id`; audit `unlink_provider` with the reason.
  - `private.unlink_on_number_change()` new body: unlink only when the linked user has a non-empty phone that matches neither new number (accounts linked by token, which have no phone, stay linked).
  - `admin_get_provider` adds `linked` (boolean) and `trader_link_expires_at` (newest unused, unrevoked, unexpired token's expiry or null).
  - Admin actions: `newTraderLink(providerId: string): Promise<{ url?: string; expires?: string; error?: string }>` (url `${NEXT_PUBLIC_SITE_URL}/platform/link/<token>`, expiry via `dayMonthYear`); `unlinkProviderAccount(prev: FormState, fd: FormData): Promise<FormState>` (fields `provider_id`, `reason`). Provider page: when not linked, button **"Trader sign-in link"** → shows the link, "Copy link" and "Expires on {date}. Works once."; when linked, "Linked to an account" and an **Unlink** form with a reason.
  - `/platform/link/[token]` (dynamic, `robots: { index: false }`): `requireMember(platformPath("link", token))`; non-uuid token → `link_invalid`; renders preview state: `ok` → "Link {business_name} to your account?" + button "Yes, this is my business"; any other state → its copy. `TRADER_LINK_ERRORS`: `link_invalid` "This link isn't valid. Ask us for a new one." · `link_used` "This link has already been used. If that wasn't you, contact us." · `link_expired` "This link has expired. Ask us for a new one." · `listing_already_linked` "This listing is already linked to an account. If that's not you, contact us." · `account_already_linked` "Your account is already linked to another listing. Sign in with a different account, or contact us."
  - `claimTraderLink(prev: FormState, fd: FormData): Promise<FormState>` (field `token`) → on success `redirect(platformPath("provider"))`.
  - `/platform/provider` empty state copy: "We couldn't find a listing linked to your account. If you're listed, ask us for your trader sign-in link."

- [ ] **Step 1: Write failing pgTAP tests:** link created, claimed by a Google account → provider linked, role `provider`, audit rows `new_trader_link` and `claim_trader_link`; **Review Focus 5:** a second account claiming the same token → `link_used`; admin unlinks with reason → `user_id` null, `unlink_provider` audit row; a fresh link works for the right account; a new link revokes the old (`link_invalid`); expired (`expires_at` set to the past) → `link_expired`; an account already linked elsewhere → `account_already_linked`; non-admin `admin_new_trader_link` → `not admin`; changing the phone number of a token-linked listing keeps the link, while a phone-linked one still unlinks (000003 behaviour).
- [ ] **Step 2: Write failing unit tests:** `claimTraderLink` maps each raised code to its copy and redirects to `/platform/provider` on success; `newTraderLink` returns an absolute URL on `NEXT_PUBLIC_SITE_URL` and rejects a non-uuid id.
- [ ] **Step 3: Write failing E2E** `trader-link.spec.ts`: admin opens Ace Plumbing → "Trader sign-in link" → copies URL; a new context signs in by email as `ace@residents.example.test`, opens the URL → "Link Ace Plumbing to your account?" → confirm → provider area lists Ace Plumbing and can reply; opening the same URL as another resident → `link_used` copy. Update `provider.spec.ts` to link through this flow instead of phone sign-in.
- [ ] **Step 4:** FAIL. **Step 5:** implement. **Step 6:** PASS.
- [ ] **Step 7:** Commit `feat: admin-issued single-use trader sign-in links`.

---

### Task 10: E2E on the new sign-in, phone kept in its own project

**Files:**
- Modify: `playwright.config.ts`, `.github/workflows/ci.yml` (only if the second server needs an env line), `e2e/account.spec.ts`, `e2e/proof.spec.ts`, `e2e/review.spec.ts`, `e2e/sms-hook.spec.ts`
- Rename: `e2e/sign-in.spec.ts` → `e2e/sign-in-phone.spec.ts`

**Interfaces:**
- Consumes: Task 5 helpers; `e2e/helpers/phone.ts` unchanged.
- Produces:
  - `webServer` becomes an array: the existing entry with `env: { ...process.env, SIGN_IN_PHONE: "off" }`, url `:3000`; a second `{ command: "npm run start -- -p 3001", url: "http://localhost:3001", env: { ...process.env, SIGN_IN_PHONE: "on" }, reuseExistingServer: !process.env.CI }` (Playwright starts entries in order and waits for each `url`, so the build from the first is reused).
  - Projects: `chromium` (baseURL `:3000`, `testIgnore: /(sign-in-phone|sms-hook)\.spec\.ts/`) and `phone` (baseURL `:3001`, `testMatch: /(sign-in-phone|sms-hook)\.spec\.ts/`).
  - Every remaining `signInWithPhone` use moves to `signInWithEmail` (held expectations) or `signInAsGoogle` (published expectations); `grep -rn signInWithPhone e2e` lists only `sign-in-phone.spec.ts` and the helper.
  - New assertion in `sign-in-email.spec.ts`: on `:3000` the sign-in page has no "Your mobile number" field; in `sign-in-phone.spec.ts` on `:3001` it has all three methods.

- [ ] **Step 1:** Make the config change and the spec moves; `npm run test:e2e` → FAIL only where a spec still assumes phone.
- [ ] **Step 2:** Fix the specs. `npm run test:e2e` → PASS in both projects; CI green.
- [ ] **Step 3:** Commit `test: E2E signs in with email and Google; phone sign-in tested with SIGN_IN_PHONE=on`.

---

### Task 11: Copy, legal pages and docs

**Files:**
- Modify: `app/(info)/privacy/page.tsx`, `app/(info)/terms/page.tsx`, `app/(info)/review-policy/page.tsx`, `app/(info)/fake-reviews-policy/page.tsx`, `app/(info)/how-ratings-work/page.tsx`, `components/site/content.ts`, `lib/account-text.ts`, `app/platform/account/page.tsx`, `app/platform/account/deleted/page.tsx`, `docs/launch/LAUNCH.md`, `README.md`, `tests/unit/no-stale-claims.test.ts`, `tests/unit/consent-text.test.ts`, `e2e/policies.spec.ts`

**Interfaces:** none new. Wording (draft banner stays on policy pages):

| Where | Becomes |
|---|---|
| `fake-reviews-policy` :32 | "Sign-in with Google or a code sent to your email (temporary and throwaway email addresses are refused); one account per Google account or email address; limits on sign-in codes per address and per connection; reviews from email-only accounts are checked by us before they appear; a new account can post one review in its first 24 hours." |
| `fake-reviews-policy` :53 | "Every reviewer signs in with Google or with a code sent to their own email address. Temporary email addresses are refused." Risk assessment section adds: "12 October 2026: sign-in moved from mobile numbers to Google and email codes. Email-only reviews are held for approval to make up for the weaker check." |
| `review-policy` :24 | "Anyone who has had work done by a provider on the site and signs in with Google or a code sent to their email. If you sign in with an email code, we check your review before it appears." |
| `terms` :33 | "To leave a review you sign in with your Google account or a code sent to your email address." |
| `how-ratings-work` :54 | "Every review comes from someone who signed in with Google or an email code. Reviews from email-code sign-ins only count once we've checked them." |
| `privacy` "People who sign in" | first bullet → "Your email address, and if you use Google, your Google account ID and the name and email Google shares with us. Our sign-in provider holds them. We use them to sign you in and to limit sign-in attempts." + "If you signed in with a mobile number before October 2026, we keep that number in the same way." ; attempts bullet → "Records of sign-in attempts: a scrambled form of your email address or number and of your connection, kept for 35 days to stop abuse." |
| `privacy` "Where it is stored" | "…Supabase also runs our sign-in. Google confirms who you are if you choose Continue with Google. Resend sends our sign-in emails. Each acts for us as a processor (Google as an independent sign-in provider under its own terms)." (Twilio sentence removed) |
| `privacy` "Deleting your account" | "…We keep a scrambled fingerprint of your sign-in (worked out from your email address, Google account or mobile number; it can't be turned back into them) for 12 months, so someone whose review was removed for breaking the rules can't sign up again to review that provider. If you signed in with a mobile number, we also keep that number privately for 12 months in case of legal claims. Then we delete them." |
| `lib/account-text.ts` + account :89, deleted :19 | the same retention sentence, short form: "We keep a scrambled fingerprint of your sign-in for 12 months, then delete it." |
| `content.ts` :100 | "Every reviewer signed in with Google or their email. Traders can reply, and a checked invoice earns a Verified job badge." |
| `content.ts` :146 | "…You only sign in, with Google or your email, to leave a review." |
| `content.ts` :216 | "If you sign in to leave a review, we keep your email address (and your Google account ID if you use Google), the name you show (like Sarah K.) and your reviews. The privacy notice has the detail." |
| `LAUNCH.md` message A | "…You can reply to any review: I'll send you a private sign-in link for your listing." |
| `LAUNCH.md` message B | "…Ask me for your sign-in link to reply to reviews." |
| `LAUNCH.md` message C | "• Leave a review for someone you've used: sign in with Google or your email, takes a minute" |
| `LAUNCH.md` Step 3/3b | Step 3b (Twilio bill) replaced by "Step 3b — Free sign-in setup" pointing to *Owner actions* below; Step 3a gains the Plan 2b paste; "What's live" says "Google and email sign-in". |
| `README.md` | sign-in section, Railway variables (`SIGN_IN_PHONE`; Twilio variables only for phone), Supabase setup per *Owner actions*, data table row "Someone signs in", "Where things live" rows for `/platform/auth/callback`, `/platform/link/[token]`, `supabase/templates/sign-in-code.html`. |

- [ ] **Step 1: Write the failing guards:** `no-stale-claims.test.ts` also bans, across `app/`, `components/`, `lib/` (except `lib/otp-gate.ts`, `lib/phone*.ts`, `lib/line-type.ts`, `lib/sms-hook.ts`, `components/auth/SignInForm.tsx`) and `docs/launch/LAUNCH.md`: `UK mobile`, `sign in with your mobile`, `signing in with your number`, `with the number on your listing`, `Twilio`. `consent-text.test.ts` asserts the consent text contains none of `mobile`, `sign in`, `Google`, `email code` and that `CONSENT_TEXT_VERSION === "2026-10-12"`. `policies.spec.ts`: `/privacy` contains `Resend` and `Google account ID` and not `Twilio`; `/fake-reviews-policy` contains `held` or `checked by us before they appear`.
- [ ] **Step 2:** FAIL. **Step 3:** make the edits. **Step 4:** `npm run lint && npm run typecheck && npm test && npm run test:e2e` → PASS.
- [ ] **Step 5:** Commit `docs: sign-in copy, privacy and policies for Google and email codes`.

---

### Task 12: One-paste production script

**Files:**
- Create: `scripts/build-production-sql.mjs`, `scripts/check-production-sql.sh`, `docs/launch/plan-2b-production.sql`, `tests/unit/production-sql.test.ts`
- Modify: `scripts/db-reset.sh` (`DB_RESET_UNTIL`), `.github/workflows/ci.yml`, `package.json` (`"db:check-prod": "bash scripts/check-production-sql.sh"`)

**Interfaces:**
- Produces:
  - `node scripts/build-production-sql.mjs --from 20261012000018 --to 20261012000022 --out docs/launch/plan-2b-production.sql` writes: a header (project `mmarznvndvbwyhhtbfjy`, "paste ALL of this into Supabase → SQL Editor → Run; one transaction; confirm the destructive-operation warning", generated-from range), `begin;`, each migration under a `-- ==== <filename>` banner, the verification block, `commit;`. Deterministic output (no timestamps beyond the header's file range).
  - Verification block (as `do $$ … raise exception … $$` so a failure rolls everything back): functions `email_gate`, `email_verify_gate`, `claim_trader_link`, `admin_list_reviews_pending` exist; `'pending' = any(enum_range(null::public.review_status)::text[])`; `blocked_email_domains` has more than 1,000 rows; `private.secrets` has `identity_pepper`; triggers `bv_guard_auth_user_insert`, `bv_guard_auth_user_phone`, `bv_scrub_auth_user` still on `auth.users`.
  - `DB_RESET_UNTIL=<prefix>` makes `db-reset.sh` (psql path) stop after the last migration whose filename starts ≤ that prefix.
  - `check-production-sql.sh`: `DB_RESET_UNTIL=20261012000017 npm run db:reset`, then `psql -X -v ON_ERROR_STOP=1 -1 -f docs/launch/plan-2b-production.sql`, then `npm run test:db`. CI runs it on the local-stack path after the main jobs (it proves the transaction works with the new enum value used only in plpgsql bodies).

- [ ] **Step 1: Write the failing test** `production-sql.test.ts`: regenerating into a temp file equals the committed `plan-2b-production.sql`; the file starts its SQL with `begin;`, ends with `commit;`, contains every 000018–000022 banner in order, and contains no `drop trigger` or `create trigger` on `auth.users`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement and generate. **Step 4:** `npm test && npm run db:check-prod` → PASS.
- [ ] **Step 5:** Commit `chore: one-paste production script for Plan 2b and a CI check that it applies`.

---

## Owner actions (outside the code)

In this order. Steps 1–6 can be done before the code is merged; step 7 must happen before merging to `main`.

1. **Resend:** sign up (free tier: 100 emails/day, 3,000/month), region **EU (Ireland)**. **Domains → Add domain → `ysbdesigns.uk`**. Resend shows the DNS records; at **one.com → DNS settings for ysbdesigns.uk** add exactly what it shows: an **MX** on `send` (→ `feedback-smtp.eu-west-1.amazonses.com`, priority 10), a **TXT** on `send` (`v=spf1 include:amazonses.com ~all`), a **TXT** on `resend._domainkey` (the long `p=…` DKIM key), and optionally a **TXT** on `_dmarc` (`v=DMARC1; p=none;`). These sit on the `send` subdomain, so they don't clash with any existing mail records on the root. Wait for **Verified** (minutes to a few hours). **API Keys → Create**, permission **Sending access**, domain `ysbdesigns.uk`; copy it once.
2. **Supabase → Authentication → Emails → SMTP Settings:** enable custom SMTP. Sender email `noreply@ysbdesigns.uk`, sender name `Bolton Vouched`, host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key, minimum interval per user 60 seconds. **Rate limits → emails sent per hour: 30.**
3. **Supabase → Authentication → Emails → Templates:** for both **Confirm signup** and **Magic Link**, subject `Your Bolton Vouched sign-in code`, body = the contents of `supabase/templates/sign-in-code.html` (it uses `{{ .Token }}` and has no link). **Sign In / Providers → Email:** enabled, **Confirm email ON** (never off: the database guard relies on new email accounts arriving unconfirmed), **Email OTP length 6**, **Email OTP expiration 900** seconds. "Allow new users to sign up" stays **ON** (the database guard refuses anything that didn't come through the app).
4. **Google Cloud Console** (console.cloud.google.com): create project **Bolton Vouched**. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding/Audience): user type **External**; app name **Bolton Vouched**; user support email yours; **no logo** (a logo triggers Google's verification); app home page `https://boltonvouched.ysbdesigns.uk`, privacy policy `https://boltonvouched.ysbdesigns.uk/privacy`, terms `https://boltonvouched.ysbdesigns.uk/terms`; authorised domains `ysbdesigns.uk` and `supabase.co`; developer contact email yours; scopes `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` only; then **Publish app** (status *In production*; with only these scopes no verification is needed, and while it's in *Testing* only listed test users can sign in). **Credentials → Create credentials → OAuth client ID → Web application**, name `Bolton Vouched (Supabase)`; **Authorised JavaScript origins** `https://boltonvouched.ysbdesigns.uk`; **Authorised redirect URIs** `https://mmarznvndvbwyhhtbfjy.supabase.co/auth/v1/callback`. Copy the client ID and secret.
5. **Supabase → Authentication → Sign In / Providers → Google:** enable; paste client ID and client secret; "Skip nonce check" **off**; "Allow users without an email" **off**. **URL Configuration:** Site URL `https://boltonvouched.ysbdesigns.uk`; Redirect URLs `https://boltonvouched.ysbdesigns.uk/**`.
6. **Supabase → Authentication → Sign In / Providers → Phone: OFF**, and **Hooks → Send SMS hook: OFF**. (Anyone who signed in by phone before must now use Google or an email code; that makes a new account.)
7. **Supabase → SQL Editor → New query:** paste the whole of `docs/launch/plan-2b-production.sql` → **Run** → confirm the destructive-operation warning (from `create or replace`, no data is deleted). It is one transaction: if anything fails nothing changes, and the verification block at the end fails it loudly if a piece is missing. Run it **once**, before merging.
8. **Railway → service `web` → Variables:** `SIGN_IN_PHONE=off`; check `NEXT_PUBLIC_SITE_URL=https://boltonvouched.ysbdesigns.uk`. The Twilio variables and `SUPABASE_SMS_HOOK_SECRET` can be removed (keep them only if you plan to switch phone back on). Merge Plan 2b to `main`; Railway redeploys.
9. **Smoke test:** on your phone's browser and in the home-screen app: sign in with an email code (check the email's sender and that it arrives within a minute), leave a test review → "Waiting for a quick check — it'll appear once approved" → approve it in `/admin` → it shows. Sign out; **Continue with Google** with a different account; leave a review → "Published". In admin, make a **Trader sign-in link** for a test listing, open it signed in as the Google account, reply to a review. Then delete the test reviews' account from the account page.
10. **Legal:** the privacy notice now names Google and Resend. Ask the solicitor to review the changes along with the other draft-banner pages. Existing consents are unaffected (the consent text didn't change).

---

## Rulings on ambiguities

1. **Held status** is a new enum value `pending`; it behaves like `under_notice` publicly (hidden, unscored) and is invisible to the provider and to reports.
2. **Who is "email-only"** is decided at posting time by `sign_in_kind`: an account with a Google identity is a Google account. A Google account that later signs in with an email code is unchanged (it keeps its Google identity). An email-code account that later continues with Google is auto-linked by Supabase (same verified address) and becomes a Google account for **future** reviews; reviews already waiting stay in the queue.
3. **Edits by an email-only account** of an approved review put it back to `pending`; approving a held review that tripped an automatic rule makes it `under_check`, not `published`.
4. **Automatic flags run on held reviews too** (they're real attempts and count toward the burst window); only `published` reviews flip to `under_check` automatically.
5. **Admins** (`admin_emails`) count as `admin` kind and still can't review, report or reply (M1's intent). The email-code form refuses admin addresses; admins keep email + password at `/admin`.
6. **Replies and reports** from email-only accounts are not held: replies need an admin-issued trader link first; reports never change a review's status.
7. **Normalisation** strips `+tags` for every domain and dots only for Gmail; the address is sent to Supabase as typed. A second account whose address normalises to an existing one is refused (`address_taken` in the app, `email already registered` in the guard), including a Google sign-up colliding with an email-code account's dot-variant Gmail (they're told to use their original method).
8. **Disposable domains:** the repo JSON (a dated snapshot of the CC0 `disposable-email-domains` list, minus a never-block list of mainstream UK providers) is the source; the database table is seeded from it and is authoritative; parent domains match. Refreshes ship as new migrations from `scripts/disposable-domains-sql.mjs`. Google sign-ups aren't checked against it (Google vets its own accounts).
9. **Caps:** 90 emails per London day and 2,900 per month leave headroom under Resend's free 100/3,000; Supabase's own 30/hour limit is the outer ceiling. Codes Supabase sends on direct API calls for existing accounts aren't counted by the app (no Send Email hook — the owner chose SMTP); Supabase's hourly limit bounds them.
10. **Wrong-code limits** reuse the phone limiter's table and settings with subject `email:<normalised>`; one IP's wrong codes count across phone and email.
11. **Email codes** expire after 15 minutes (`otp_expiry = 900`), matching the 15-minute nonce window; "Confirm email" stays on so a new account always needs the code.
12. **Passwords:** every non-admin account's password is replaced with a random hash on insert and on any change; email changes are refused for non-admins (a user-initiated change sets `email_change`, which the scrub trigger refuses). No new triggers on `auth.users`.
13. **Identity keys** are HMACs with a database-only pepper, never plain text; email and Google ids are not retained in plain form after deletion. Phone accounts keep the existing `phone_retention` row as well (privacy notice, legal claims). Existing `phone_retention` rows are backfilled into `identity_retention`.
14. **Trader links** are uuid tokens (only their SHA-256 stored), single use, 14 days, one active per listing (a new link revokes the old); claiming needs a finished profile and is refused if the listing or the account is already linked. The admin can unlink with a logged reason. Token-linked listings stay linked when their numbers change.
15. **Phone path:** code, tables, hook and tests stay. With `SIGN_IN_PHONE` off the page hides it, the actions refuse and the hook answers 403; phone-number listing claims happen only in the phone verify step, so they're off too. Phone E2E runs in its own Playwright project with the switch on.
16. **Consent text** doesn't mention sign-in, so `CONSENT_TEXT_VERSION` stays `2026-10-12` (guarded by a test).
17. **OAuth callback** lives at `/platform/auth/callback` (inside the proxy's private, no-store set); `redirectTo` comes from `NEXT_PUBLIC_SITE_URL`; `next` round-trips through the callback query and `safeNext` on both ends.
18. **PWA:** the email code is the reliable path in the installed app; a hint under the Google button says so only in standalone mode. No attempt to keep Google's redirect inside the iOS home-screen app.
19. **Existing phone accounts** can't sign in while phone is off; they start a new account with Google or email. No merge tool (none expected at launch scale).
20. **Production:** one generated transactional script; the new enum value is used only inside plpgsql bodies so it can be added in the same transaction, and CI applies the script on top of a 000017-state database to prove it.

## Done when

On production with `SIGN_IN_PHONE=off`, a resident can sign in with Google or a 6-digit email code (from `noreply@ysbdesigns.uk`, also inside the home-screen app), finish Welcome and review; Google reviews publish under the usual checks, email-only reviews wait in the admin's "Reviews awaiting approval" until approved or removed with a reason; disposable addresses, password sign-ups and unapproved email sign-ups are refused by the database; a removed reviewer can't come back through a fresh Google or email account for 12 months; a trader links their listing by opening the admin's one-time link; no public copy mentions mobile sign-in; the phone path still passes its tests with the switch on; `plan-2b-production.sql` applies in one transaction; and lint, typecheck, unit, pgTAP and both Playwright projects pass in CI.
