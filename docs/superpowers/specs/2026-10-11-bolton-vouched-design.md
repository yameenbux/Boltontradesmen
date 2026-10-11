# Bolton Vouched — v1 design

**Status:** draft for review · **Date:** 2026-10-11

A local recommendations register for Bolton, grown out of the 717-member "Bolton Tradesmen" WhatsApp group. Residents find people for any job — plumbers, caterers, bouncy castles — and see structured, verified reviews from other residents. Providers are listed free; they pay only for verification tools once the platform has demonstrably sent them work.

---

## 1. Goals and constraints

**Primary user for v1:** residents looking for someone to do a job.

**Business goal:** side income, paid by providers, never by residents.

**Success at day 90 (kill criteria):**

| Checkpoint | Minimum | If missed |
|---|---|---|
| Day 30 | 20 providers live, 40 reviews | Fix outreach before writing more code |
| Day 90 | 25 providers live, 60 reviews, contact taps every week | Stop investing; keep running as a free register |
| Day 180 | At least 5 paying providers (covers running costs) | Reconsider the paid tier |

**Non-negotiable rules** (enforced in the schema, not just policy):

1. **Money never moves a rating.** Payment buys tools and verification, never score, rank position or search inclusion.
2. **No provider is listed without consent.** `consent_at` and `consent_evidence` are required before status can become `live`.
3. **Every posted review has a phone-verified person behind it.**
4. **Reviews are removed only for cause**, with a mandatory logged reason. Never hard-deleted.

**Out of scope for v1:** native store apps, in-app messaging, job posting / quote requests, provider self-signup (invite only), childcare / babysitting / care categories, residents paying for anything.

---

## 2. Architecture

One Next.js (App Router, TypeScript) application, installable as a PWA, hosted on Vercel.

| Area | Routes | Access |
|---|---|---|
| Public | `/`, `/c/[category]`, `/p/[provider-slug]`, `/community`, policy pages | Anyone, no login. Server-rendered for search indexing |
| Resident | `/account`, review form, community posting | Phone-verified residents |
| Provider | `/provider/*` | Phone-verified providers (invited only) |
| Admin | `/admin/*` | Admin accounts only |

**Services**

- **Supabase** (London region): Postgres with row-level security (RLS), phone OTP auth, private storage buckets.
- **Twilio**: Verify for OTP SMS (Fraud Guard on), Lookup for line-type checks, Messaging for notification texts.
- **Stripe**: Checkout (subscriptions), Customer Portal, webhooks.
- **Sentry** for errors; an uptime monitor.

**Structural rules**

1. Ranking and search read only from the `provider_public` view, which has no billing columns and no phone numbers.
2. Phone numbers never appear in rendered HTML. Contact buttons hit `/api/contact/[provider]?via=call|whatsapp`, which logs a `contact_event` and redirects to `tel:` / `wa.me`.
3. All writes go through server actions / Postgres `SECURITY DEFINER` functions. Browsers have no direct table write access. Anti-fake rules live in those functions.

**Naming:** the code uses **provider**, not trader, throughout.

---

## 3. Data model

**People**

- `profiles` — `user_id` (→ `auth.users`), `role` (`resident` / `provider` / `admin`), `display_name` (rendered "Sarah K."), `postcode_district`, `line_type`, `line_type_checked_at`, `group_member_at`, `created_at`, `blocked_at`. Phone numbers live only in `auth.users`.

**Providers**

- `category_groups` — `id`, `name`, `sort`, `asks_tidy` (bool).
- `categories` — `id`, `group_id`, `slug`, `name`, `requirement` (`none` / `gas_safe` / `dvsa_adi`), `guidance_note` (e.g. the electrical note), `active`.
- `providers` — `id`, `slug`, `business_name`, `contact_name`, `phone_e164`, `whatsapp_e164`, `areas text[]`, `bio`, `user_id` (null until activated), `status` (`invited` / `consented` / `live` / `paused` / `removed`), `consent_at`, `consent_evidence jsonb` (timestamp, IP, consent text version), `consent_token`, `created_at`.
  - Check constraint: `status = 'live'` requires `consent_at IS NOT NULL`.
- `provider_categories` — `provider_id`, `category_id`. Maximum 3 per provider (trigger). Cannot link to a category with a `requirement` unless the matching check is recorded and in date.
- `provider_checks` — `provider_id`, `kind` (`id` / `insurance` / `gas_safe` / `dvsa_adi` / `food_hygiene` / `pipa` / `niceic_napit` / `dbs` / `other`), `reference`, `expires_on`, `checked_at`, `checked_by`, `document_path`. Admin-only table; a sanitised summary is exposed publicly.
- `subscriptions` — `provider_id`, `stripe_customer_id`, `stripe_subscription_id`, `plan` (`monthly` / `annual`), `status`, `current_period_end`. **Not readable by `provider_public`.**

**Reviews**

- `reviews` — `id`, `provider_id`, `reviewer_id`, `category_id`, `job_month` (date, month precision), `value_band` (`<250` / `250-1k` / `1k-5k` / `5k+`), `on_time` (`yes` / `late_informed` / `no`), `on_price` (`yes` / `slightly_over_explained` / `significantly_over`), `quality` (1–5), `tidy` (bool, nullable — only for groups with `asks_tidy`), `use_again` (`yes` / `maybe` / `no`), `comment` (≤ 400 chars), `status` (`published` / `under_check` / `under_notice` / `removed`), `removal_reason`, `device_hash`, `created_at`, `edited_at`.
  - Unique: one non-removed review per (`provider_id`, `reviewer_id`).
  - Editable by the reviewer for 14 days after creation.
- `review_proofs` — `review_id`, `storage_path`, `checked_at`, `checked_by`, `outcome`. A review shows **Verified job** when a proof has `outcome = 'accepted'`.
- `review_responses` — one per review: `provider_id`, `body` (≤ 400), editable 14 days.

**Community**

- `posts` — `author_id`, `category_id` (nullable), `postcode_district`, `body` (≤ 280), `status` (`published` / `hidden`), `resolved_at`, `created_at`.
- `post_replies` — `post_id`, `author_id`, `body` (≤ 280), `tagged_provider_id` (nullable), `unlisted_name` (nullable), `status`, `created_at`.

**Integrity and operations**

- `contact_events` — `provider_id`, `type` (`profile_view` / `call_tap` / `whatsapp_tap`), `actor_id` (nullable), `device_hash`, `created_at`.
- `flags` — `target_type`, `target_id`, `source` (`auto` / `user`), `rule`, `note`, `status`, `resolved_by`, `resolved_at`.
- `complaints` — `review_id`, complainant name/email, `meaning_attributed`, `why_defamatory`, `consents_to_share`, `received_at`, `poster_notified_at`, `poster_deadline_at`, `outcome`, `closed_at`.
- `audit_log` — `actor_id`, `action`, `target_type`, `target_id`, `reason`, `created_at`. Written for every admin action.
- `settings` — `group_code`, `enquiry_threshold` (default 5), `sms_monthly_cap_gbp`.
- `phone_retention` — locked table holding deleted users' phone numbers for 12 months for legal claims.

**Public view: `provider_public`**

Only `live` providers. Exposes: profile fields (no phones), categories, sanitised checks summary, `is_verified`, review count, and computed stats:

- **Would use again %** (headline): share of `use_again = 'yes'`.
- On time %, on price %, tidy % (tidy only where applicable).
- **Quality score** (shrunk), never shown below 3 reviews:

```
score = (v / (v + m)) × R + (m / (v + m)) × C
  R = provider's recency-weighted mean quality
  v = published review count
  C = register-wide mean quality
  m = 3
  review weight w = 0.5 ^ (age_months / 24)
```

Reviews with status `under_check` count; `under_notice` and `removed` do not.

**Enquiry definition** (drives the upgrade prompt): a `call_tap` or `whatsapp_tap`, deduplicated to at most one per (`provider`, actor-or-device, calendar day), excluding taps by the provider's own account and admins.

---

## 4. Resident experience

**Browsing (no login)**

1. **Home** — "What do you need?" search, category groups grid, postcode district filter (BL1–BL7 and neighbours), latest community questions, "Ask the community" button.
2. **Category list** — provider cards: name, categories, areas, Would use again %, review count, Verified badge, Verified-job review count. Ranked by shrunk score, then review count, then most recent review. Providers with fewer than 3 reviews appear in a separate **New on Bolton Vouched** section below the ranked list. Optional "Verified only" filter (filters, never re-ranks). Category `guidance_note` shown at the top where set.
3. **Provider profile** — headline stats, distribution, **Checks** row (e.g. `✓ ID checked Oct 2026 · ✓ Insured to Mar 2027 · Accreditations: none provided`), Call and WhatsApp buttons, reviews (filters: Verified job, Group member) with provider replies, Leave a review, Report on each review.

**Sign-in (only when posting)**

4. Phone → SMS code → for new accounts: display name, postcode district, optional group code (sets `group_member_at`, earns the **Group member** badge on their content). UK +44 numbers only. VoIP/virtual numbers rejected with a plain-English message.

**Reviewing**

5. Single screen: category, job month, value band, the questions as tap buttons (tidy only for applicable groups), optional comment, optional proof upload ("only the admin sees this"). Prompt above submit: *"Be honest — mixed jobs are useful too."* Result: "Published" or "Published, under a quick check". Draft autosaved to the device. Editable for 14 days; edits re-run checks.

**Community feed**

6. Questions list filterable by category and district. Post: category (optional), district, ≤ 280 chars.
7. Replies are recommendations only: **tag a listed provider** (profile card) or **"Not listed? Add their name"** (goes to admin leads). Negative-language detection (*avoid*, *cowboy*, *ripped off*, *scam*, …) shows: "Had a bad experience? Leave a review instead, so they can respond." Posting anyway is allowed but auto-flags the reply. The asker can mark a question **Resolved**.
8. Childcare / babysitting / care questions may be asked, but no such categories exist to tag. The feed shows a note pointing to Bolton Council's Family Information Service when those keywords appear.

**Account**

9. My reviews, my posts, group status, **Delete account** — unpublishes the user's reviews and posts; phone moved to `phone_retention` for 12 months (disclosed in the privacy notice).

**Static pages:** How ratings work, Review policy, Fake-reviews policy, Privacy notice, Terms, Complaint form (collects the fields a defamation notice requires).

---

## 5. Providers and payments

**Onboarding (including the initial 20 seeded providers)**

1. Admin creates the provider (`invited`); system generates a consent link with a single-use token.
2. Admin sends it by WhatsApp. Consent page shows exactly what will be published and the review policy in plain words; **I agree** records timestamp, IP and consent-text version → `consented`.
3. Admin sets `live` after a final check. Category requirements (Gas Safe, DVSA ADI) must be recorded before those categories can be attached.

**Login and activation**

- Providers sign in with the phone number on their listing; the account links automatically.
- When the first enquiry arrives, they get one SMS: "You've had your first enquiry through Bolton Vouched — see your dashboard: [link]".

**Dashboard**

- Profile views, call and WhatsApp taps (this month / all time).
- Upgrade progress: "3 of 5 enquiries".
- Reviews with **Reply** (one per review, ≤ 400 chars, editable 14 days) and **Report**.
- Edit bio, areas, categories (max 3).
- **Pause** and **Withdraw** (immediate removal; reviews hidden with the profile and restored on re-listing).

**Upgrade to Verified**

1. On reaching the enquiry threshold: dashboard banner and **one** SMS. No repeated nagging.
2. Stripe Checkout: **£10/month or £100/year.** (Below the VAT threshold — no VAT.)
3. Document upload: **photo ID (required)**; optional insurance, accreditations, DBS, category credentials.
4. Admin checks; on approval `is_verified` is true and the badge shows what was checked and when. If ID is rejected, admin issues a full refund via Stripe (stated in the terms).

**Verified includes:** badge with Checks summary, up to 6 work photos, monthly enquiry report (taps by category and district), inclusion in the "Verified only" filter. It does **not** affect ranking.

**Lapses**

- Failed payment: Stripe Smart Retries (~2 weeks), then badge and photos removed. Listing and reviews stay.
- Insurance expiry: SMS reminder 30 days before; insurance tick removed on expiry (badge stays — ID is the badge requirement).
- Cancellation via Stripe Customer Portal; Verified remains until period end.

**Webhooks:** `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Signature verified; handler idempotent by event ID.

---

## 6. Categories

About 40 categories in 6 groups, editable in admin:

| Group | Examples | Asks "tidy"? |
|---|---|---|
| Home & trades | Plumber, electrician, gas & boilers, joiner, plasterer, painter, roofer, handyman | Yes |
| Repairs & appliances | Appliance repair, heating repair, phone & computer repair | No |
| Moving & waste | Rubbish removal, man & van, skip hire, house clearance | Yes |
| Events & occasions | Caterer, bouncy castles, DJ, cakes, decor, photographer | No |
| Personal & lessons | Mobile hair & beauty, tutors, driving instructors, fitness | No |
| Vehicles | Mechanic, valeting, MOT | No |

**Hard requirements (legal):** Gas & boilers → verified Gas Safe registration. Driving instructors → DVSA ADI licence. Required for listing in that category, paid or not.

**Shown if provided:** food hygiene rating (caterers, cakes), PIPA tag (inflatables), NICEIC/NAPIT (electricians), insurance, DBS.

**Guidance note on Electrician:** "For rewires and new circuits, look for an NICEIC/NAPIT tick or ask about building control sign-off."

---

## 7. Admin, moderation and anti-fake controls

**Admin home** — counts and lists, in priority order: complaints with countdowns (red under 24h), reviews under check, proofs to check, verification documents to check, providers who hit the threshold, leads (unlisted names grouped and counted).

**Admin screens:** Providers, Reviews, Feed, Complaints, Users, Settings, Audit log. Every action writes to `audit_log` with a reason where relevant.

**Automated rules**

| Stage | Rule |
|---|---|
| Signup | +44 only; VoIP/virtual numbers blocked via Twilio Lookup; one account per number; OTP rate limits per number and per IP; Twilio Fraud Guard; hard monthly SMS spend cap |
| Posting a review | One live review per provider per person; providers cannot review themselves or providers sharing any of their categories; accounts < 24h old may post one review |
| Auto-flag → `under_check` | 3+ reviews for one provider in 48h; several accounts created within 10 minutes reviewing the same provider; shared `device_hash` across reviewers of one provider; brand-new account whose only activity is a single 5-star review |

Rules apply symmetrically to positive and negative bursts. Flagged reviews stay visible with an "under check" label.

**Complaints (Defamation (Operators of Websites) Regulations 2013):** notice form → poster notified within 48 hours (non-business days excluded) → poster has 5 days to respond → act per their response, with templates for each step. Deadlines computed, not typed. New complaints SMS the admin.

**Published compliance documents:** fake-reviews policy and a dated risk assessment (DMCC Act 2024).

**Expected admin time:** ~2–3 hours/week.

---

## 8. Error handling

- Contact redirect always proceeds even if event logging fails.
- Public pages are statically generated/cached so browsing survives a Supabase outage; posting shows a clear paused message.
- Stripe: webhook retries plus a **nightly reconciliation** job comparing Stripe subscriptions with `subscriptions` and correcting drift.
- SMS failures show a retry message, never a raw error.
- All input validated server-side with plain-English errors; review form drafts saved locally.
- Uploads: images and PDF only, ≤ 10 MB, private buckets, **EXIF/GPS metadata stripped** from images.
- Alerts by SMS to the admin: new complaint, webhook failure, SMS spend at 80% of cap.
- Nightly database backup to private storage.

---

## 9. Testing

- **Unit:** score maths, enquiry deduplication, each anti-fake rule, complaint deadline calculation.
- **Database (RLS):** anonymous users cannot read phones, checks documents or billing; residents cannot write tables directly; a test asserts `provider_public` has no billing columns and fails the build if one appears.
- **Payments:** Stripe test mode, replayed webhook events, reconciliation job.
- **SMS:** Twilio mocked in tests.
- **End-to-end (Playwright):** resident browse → sign in → review; provider consent → 5 enquiries → upgrade → verified; admin resolves a flag and a complaint.
- **CI (GitHub Actions):** lint, typecheck, unit, database and E2E tests on every pull request.
- **Environments:** separate staging Supabase project and Stripe test mode; real data never used in tests.

---

## 10. Costs

| Stage | Monthly |
|---|---|
| Before charging (free tiers + SMS) | ~£5–15 |
| Once charging (Vercel Pro ~$20, Supabase Pro ~$25, SMS) | ~£40–45 |

Break-even: 4–5 paying providers. One-off/annual: domain (~£10/yr), ICO data protection fee (~£52/yr), Ltd company formation (~£50).

---

## 11. Owner actions outside the code

These are prerequisites the build cannot do:

- Register `boltonvouched.co.uk` (availability not yet confirmed).
- Form a limited company before publishing reviews or taking payment.
- Pay the ICO data protection fee.
- Create Supabase, Twilio, Stripe, Vercel and Sentry accounts.
- Contact and get consent from the first 20 providers.
- Recommended: one hour with a solicitor on the review, complaint and verification wording.

*This specification is not legal advice.*
