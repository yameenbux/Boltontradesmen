# Bolton Trades — build specification

**v0.1 · draft · August 2026**

A community review register for the Bolton Tradesmen WhatsApp group. This document defines what gets built, how ratings are calculated, how the platform stays legal, and how it earns money without corrupting the thing it sells.

---

## 1. The four rules

Everything below is negotiable. These four are not. If a future feature breaks one of them, the feature is wrong — not the rule.

**Money never moves a rating.** Payment buys tools and verification. It never changes a score, a rank position, or which traders appear in a search result.

**Every review has a real person behind it.** Phone-verified reviewer, real job, one review per trader per person. No anonymous posting — that shifts legal liability onto you.

**No trader is listed without consent.** Numbers scraped from the group chat build your outreach list, not your public directory. Consent first, publish second.

**Negative reviews are removed only for cause.** Fake, abusive, off-topic, or actioned under a formal complaint. Never because the trader asked, and never because they pay you.

> **Why this is enforced in the schema, not the policy.** A rule written in a policy page gets broken the first time a paying trader phones you annoyed. A rule enforced by the database — no `is_paid` column readable by the ranking function — cannot be broken in a weak moment. Build the constraint, don't rely on your own discipline.

---

## 2. Scope of v1

### In

- Browsable directory of consented traders, filterable by category and BL postcode district
- Trader profile: name, categories, areas, structured stats, reviews, right-of-reply, tap-to-call and tap-to-WhatsApp
- Phone-verified sign-in for reviewers, gated by a join code circulated in the group
- Structured review form (see §4) with an optional short comment and photos
- Admin view: consent status, flagged reviews, complaints queue, event counts per trader
- Installable as a home-screen web app

### Out — deliberately

- **Payments.** Nothing is chargeable until Phase 1 (§8). Building Stripe now is building the wrong thing.
- **In-app messaging.** The group already uses WhatsApp. Competing with it loses.
- **Job posting / quote requests.** Tempting, and it doubles your moderation load. Wait until the review side has traction.
- **Native apps.** A PWA is the right call.
- **Trader self-signup.** Invite-only until there is a verification process. Open signup is how a trust platform fills with cowboys in week three.

> **Scope discipline.** The most likely failure of v1 is not a missing feature. It's spending four months building six features and launching to an empty directory. All of §2 should be shippable in three or four weekends.

---

## 3. Data model

Postgres. Six core tables plus an event log. The event log is not an afterthought — it is the asset that lets you charge money later, because it's the only thing that can prove the platform sent a trader work.

### `trader`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `business_name` | text | Public |
| `contact_name` | text | Public — this is a word-of-mouth register, the name matters |
| `phone_e164` | text | **Not rendered in HTML.** Served behind a tap event so contact is measurable |
| `whatsapp_e164` | text null | Same treatment |
| `categories` | uuid[] | Max 3. Traders who claim eight trades are a red flag; make the limit structural |
| `areas` | text[] | BL1–BL7, plus neighbouring districts |
| `status` | enum | `invited` / `consented` / `live` / `paused` / `removed`. Only `live` is public |
| `consent_at` | timestamptz | Null blocks publication at the query layer |
| `consent_evidence` | text | Reference to the signed form or saved message |
| `insurance_expiry` | date null | Drives automatic badge expiry |
| `accreditations` | jsonb | Gas Safe no., NICEIC, NAPIT — each with a checked date |
| `verified_at` | timestamptz null | Set only when you personally saw the documents |

### `app_user` — reviewers

| Field | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `phone_e164` | text unique | Encrypted at rest. Never public. Needed for the §6 defence |
| `phone_verified_at` | timestamptz | No verification, no posting |
| `display_name` | text | Shown as "Yameen B." — first name plus surname initial |
| `join_code_used` | text | Ties the account to the group cohort it came from |
| `linked_trader_id` | uuid null | Set if this person is also a listed trader. Blocks same-category reviews |
| `blocked_at` | timestamptz null | |

### `review`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `trader_id` | uuid fk | |
| `reviewer_id` | uuid fk | |
| `job_month` | date | Month precision only. Nobody remembers the day, and it reduces identifiability |
| `category_id` | uuid fk | What the job actually was |
| `value_band` | enum | `<£250` / `£250–1k` / `£1k–5k` / `£5k+`. Lets you weight big jobs later |
| `answers` | jsonb | The five structured answers in §4 |
| `comment` | text null | 400 char cap. Length limits reduce defamation surface |
| `status` | enum | `published` / `under_notice` / `removed` |
| `removal_reason` | enum null | Logged, permanently, for every removal |
| `created_at`, `ip`, `user_agent` | | Retained 12 months. Evidence, not analytics |

**Constraint:** `unique (trader_id, reviewer_id)` where `status != 'removed'`, overridable only if the reviewer genuinely used the trader for a second, distinct job at least six months later.

### `complaint` — mirrors the statutory notice

| Field | Purpose |
|---|---|
| `review_id` | The statement complained of |
| `complainant_name`, `_email` | Required for a valid notice |
| `meaning_attributed` | What the complainant says the statement means |
| `why_defamatory` | Their explanation, plus which parts are inaccurate or unsupported opinion |
| `consents_to_share` | Whether their identity may be passed to the poster |
| `received_at`, `poster_notified_at`, `poster_deadline_at` | The clock in §6. Computed, not typed |
| `outcome`, `closed_at` | Auditable trail |

### `event` — the commercial asset

| Field | Notes |
|---|---|
| `trader_id`, `type`, `created_at` | `profile_view` / `phone_tap` / `whatsapp_tap` |
| `actor_id` | Nullable — anonymous browsing is allowed, only reviewing requires an account |

Also: `category` (flat list, ~25 trades, no hierarchy at this size) and `trader_response` (one reply per review, capped at 400 chars, published without moderation unless flagged).

---

## 4. Rating and ranking

### The review form

Five questions. Free-text stars alone will give you a wall of 4.8s, because nobody writes an honest criticism of a plasterer they'll see in Asda. Specific factual questions get honest answers where a rating box does not.

| Question | Answers | Shown on profile as |
|---|---|---|
| Did they turn up when they said they would? | Yes / Late but let me know / No-showed at least once | "On time: 91% of 22 jobs" |
| Was the final price within the quote? | Yes / Slightly over, explained / Significantly over | "Stuck to quote: 86%" |
| Quality of the finished work | 1–5 | Headline score |
| Did they leave the place clean? | Yes / No | "Tidy: 95%" |
| Would you use them again? | Yes / Maybe / No | **"Would use again: 88%"** |

> **Make "would use again" the hero number.** It's near-binary, so it resists grade inflation in a way a 1–5 star cannot, and it is the number a homeowner actually wants. Put it above the star score on the profile card. Stars are what people expect; this is what informs them.

### Score calculation

Never display a raw mean. One five-star review would put a brand-new trader above a joiner with forty reviews averaging 4.6, and the register loses credibility on day one. Shrink towards the platform average until there is enough evidence.

```
score = (v / (v + m)) × R  +  (m / (v + m)) × C

  R = trader's recency-weighted mean quality (1–5)
  v = number of published reviews
  C = platform-wide mean quality
  m = confidence constant — use 3, revisit at 200 reviews
```

Recency weight on each review: `w = 0.5 ^ (age_months / 24)` — a review halves in influence every two years. A trader who was good in 2023 and slipped last year should show it.

> **Why `m = 3` and not 5.** Tested against a 42-review sample: at `m = 5` the worst trader on the board still displayed as 3.6, because with four reviews the prior outweighs the evidence. At `m = 3` the same trader shows 3.4 and the spread across the board widens from 0.95 to 1.22 points. In a register where most traders sit on three to eight reviews for a long time, 5 over-smooths. Revisit once any trader passes 20 reviews.

- **Under 3 reviews:** show no score at all. Display "3 reviews needed" and the raw reviews. An unrated trader is honest; a 5.0 from one mate is not.
- **Always show the count and the distribution** next to the score. A 4.9 from 40 and a 4.9 from 4 must not look identical.
- **Default sort:** shrunk score desc, then review count desc, then most-recent-review desc.
- **Paid status is not an input.** The ranking function must not have access to the billing table. Enforce with a database view that omits the column.

---

## 5. Review integrity

Since 6 April 2025 the DMCC Act 2024 makes fake reviews illegal and requires anyone who *publishes* consumer reviews to take reasonable and proportionate steps against them — written policies, a risk assessment, detection, investigation and removal. At this scale "proportionate" is modest, but it is not nothing, and the list below *is* the compliance evidence. Write it down and date it.

### Controls

- **Phone-verified accounts only**, with a rotating join code posted in the group. This is also the moat: reviews from people the reader recognises are the one thing Google can't offer.
- **One review per reviewer per trader.** Enforced by unique constraint, not by UI.
- **Traders cannot review competitors** in a category they're listed under. Detected via `linked_trader_id` and by matching phone numbers.
- **New-account cooling-off:** an account under 24 hours old can post one review, not five.
- **Cluster alerts:** flag for manual review when a trader receives 3+ reviews in 48 hours, or when multiple reviewers share a device fingerprint or signed up within minutes of each other.
- **Publish immediately, moderate after.** Pre-moderation makes you the author. Post-moderation with a fast takedown path is safer and better for the user.

### Prohibited, by law and by charter

- **No review gating.** You must not let a trader choose who gets invited to review. A "request a review" link goes to everyone or nobody — filtering for happy customers is a banned practice.
- **No unlabelled incentives.** If you run a prize draw to boost review volume, every resulting review must be prominently labelled as incentivised.
- **No suppression.** Hiding, delaying or de-weighting negative reviews is specifically prohibited — including via the aggregate score.
- **No importing reviews from the chat.** A recommendation typed in WhatsApp in 2024 is not a verified review, and republishing it under someone's name is both a DMCC and a data-protection problem. Use the chat to find *traders*, not to manufacture *reviews*.

> **The uncomfortable one.** You are a member of this community. Sooner or later a trader you like personally will get a fair 2-star review and will ask you, as a mate, to take it down. Decide now, in writing, that you won't — and tell traders that at signup. A register that bends once is worth nothing, and the group will find out.

---

## 6. Complaints and defamation

Section 5 of the Defamation Act 2013 gives website operators a defence for content posted by others — but only if you follow the process in the Defamation (Operators of Websites) Regulations 2013 when a valid notice arrives. Get this wrong and you are liable for what a reviewer wrote. Build the clock into the admin tool; do not run it out of your inbox.

### A valid notice of complaint must contain

- The complainant's name and email address
- The statement complained of and where it appears
- Why it is defamatory, and the meaning they attribute to it
- Which parts are factually inaccurate or unsupported opinion
- Confirmation they don't have enough information to sue the poster directly
- Whether they consent to their name and email being passed to the poster

Anything short of that is not a valid notice. The complaint form should collect exactly these fields and refuse to submit without them — which quietly filters out most angry-trader complaints before they become a legal process.

### The clock

**Within 48 hours** — acknowledge to the complainant, and pass a copy to the poster, redacting the complainant's identity unless they consented. Tell the poster the review may be removed unless they respond within 5 days. If you have no way to contact the poster, you must remove the statement now. *(This is exactly why anonymous reviews are banned in §1.)*

**Within 5 days** — the poster responds, or doesn't. No response means you must remove it and tell the complainant.

**Within 48 hours of that** — if the poster refuses removal and provides contact details for onward disclosure, inform the complainant. The dispute is now between them, not you.

All 48-hour periods exclude weekends and UK bank holidays.

### Practical consequences for the build

- Reviewer contact details must be retained and retrievable — this process cannot run on anonymous accounts
- A `removed` review is soft-deleted with a reason and an audit trail, never hard-deleted
- Reviews under notice show as "temporarily unavailable", not silently vanish — silent removal looks like suppression under §5
- Publish a plain-English moderation policy and complaints route before launch, not after the first complaint

---

## 7. Data protection

You will be the data controller. A sole trader's name and mobile number are personal data, so lifting numbers out of a group chat and publishing them is regulated processing — this is the part of the plan most likely to cause an actual problem with an actual person.

| Data | Lawful basis | How it works in practice |
|---|---|---|
| Trader listing details | Consent | Legitimate interests is arguable, but consent is safer and far better politics in a small community. One-tap consent form, timestamp and evidence stored, withdrawal delists within 24h |
| Reviewer phone number | Contract + legal obligation | Necessary to provide the service and to run the §6 process. Never displayed, never shared except under the statutory procedure |
| Review content | Legitimate interests | Public interest in accurate trader information. Do an LIA and keep it on file — one page is enough |
| Event log | Legitimate interests | Aggregate only after 90 days; no need to keep row-level browsing history |

### Before publishing a single profile

- **Outreach list ≠ directory.** Numbers from the chat go into a private outreach table with status `invited`. Nothing renders publicly until `consent_at` is set. Make this a database constraint.
- **Register with the ICO.** The data protection fee is £52/year at Tier 1 (micro), £47 by direct debit. Use the ICO's self-assessment to confirm you're not exempt — as a controller running a public review platform, you almost certainly are not.
- **Privacy notice and terms** live before launch, naming you or your company as controller with a contact route.
- **Erasure requests:** a reviewer who withdraws has their identity pseudonymised — the review content can stay under legitimate interests, but say so explicitly in the privacy notice.
- **Close the withdraw-and-relist loophole.** A trader who withdraws consent is delisted, but their reviews are retained in a non-public state and reattach if they ever list again. Otherwise "withdraw consent, sign up fresh" becomes a one-tap way to wipe a bad record — which quietly breaks the no-suppression rule in §5. Say this plainly in the trader terms at signup.
- **Don't publish mobile numbers as text.** Tap-to-call behind an event handler protects traders from scrapers and gives you the usage data §8 depends on. Two problems, one decision.

---

## 8. Monetisation

**Decided: a flat monthly fee, and the free period ends on an outcome rather than a date.** Commission on job value is rejected.

### Why not commission

1. **You cannot observe the thing you'd be charging for.** You can log a contact tap. You cannot see whether a job happened or what it was worth. Collection would depend on traders self-reporting revenue to the person taking a cut of it. Every marketplace that successfully charges commission — Airbnb, Uber, Fiverr — controls the payment rail. You don't, and won't: a £4,000 bathroom gets paid by bank transfer in someone's kitchen.
2. **The number is too visible.** 5% of a £5,000 extension is £250. A flat tenner is invisible; £250 is an argument. Tellingly, *none* of Checkatrade, MyBuilder, Rated People or Bark charges commission on job value — all use subscriptions, per-lead fees or credits. That is not an oversight in a mature market.
3. **It corrupts your incentive.** On a flat fee you are indifferent between traders. On commission you earn more when high-value trades get work, which gives you a financial reason to nudge the register — and once the group works out you take a cut of jobs, "trustworthy platform" is finished.

### What the market charges, 2026

| Platform | Model | Commission on job value? |
|---|---|---|
| Checkatrade | From ~£30–60/mo, members report £80–500 | No |
| Rated People | £30–60/mo + £15–40/lead | No |
| MyBuilder | Pay-per-lead, ~£5–35 | No |
| Bark | Credits, ~£9–36/lead | No |
| **Bolton Trades** | **£10/mo after 5 enquiries** | **No** |

### Why not a free *month*

A calendar trial fails for a specific reason: in month one the register will have few reviews and little traffic, so most traders will receive *zero* enquiries during their free month. You then ask them for money. They say no — and, worse, they say so in the group. A trader who tried it and got nothing is far more damaging than one who never joined.

So the trial ends on delivery, not on a date: **free until the trader has had five enquiries through the app.** It is the strongest pitch a new platform can make and it is true — "you don't pay until it's actually brought you work." Traders who get nothing never pay and never resent you, and revenue starts precisely when it can be defended.

### Phases

**Phase 0 — per trader — £0.** Free until five enquiries. Every profile view and contact tap is logged against a trader, and the count is shown on their own profile so the meter is never a mystery. *Ends for that trader at 5 contact taps, whenever that happens — week three or never.*

**Phase 1 — £36–48/year.** Verified badge. You check public liability insurance, photo ID, trade body registration and company or UTR details. The badge states *what* was checked and when it expires, and auto-revokes when the insurance does. It is a verification service with real work behind it — not an advert. **Zero effect on rank or score**; it's a filter option, not a boost. *Risk to price in: issuing a badge is a representation. Wording must be precise about what was and wasn't checked, and you should be a limited company before issuing the first one.*

**Phase 2 — £10/month, or £100/year.** Listing and tools, once it has worked. Instant enquiry alerts, photo gallery, monthly stats email, right of reply. *Unlocks Phase 3 at: median live trader receiving 8+ contact taps per month.*

**Phase 3 — £25–40/month, or per enquiry.** Priced on demonstrated leads. Only once you can show a trader their own enquiry count for the last 60 days. At that point the conversation stops being "support my project" and becomes "here are fourteen enquiries, that's £2 each."

### Never, at any phase

- Paid rank, paid "recommended" placement, or paid inclusion in search results
- Paid removal or suppression of a review
- Any sponsored slot that isn't in a visually separate block labelled **Advertisement**
- A percentage of any job

Run the arithmetic honestly: 40 traders at £10 is £400/month gross, before Stripe fees, hosting and your time. Decide whether this is a business or a community service that covers its costs. Both are fine — but if it's the latter, don't warp the product chasing the £400.

---

## 9. Technical build

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js, App Router | Server-rendered profile pages so the directory is findable in Google — also a free acquisition channel |
| Hosting | Vercel free tier | Sufficient at this scale for a long time |
| Database & auth | Supabase | Postgres with row-level security, phone OTP auth, and file storage in one. RLS is what lets you enforce §1 in the schema |
| SMS | Twilio via Supabase | Roughly 3–5p per UK message. 500 verifications ≈ £25 |
| Payments | Stripe — Phase 1 only | Not in v1 |
| Images | Supabase storage + Next/Image | Strip EXIF on upload. Job photos carry GPS coordinates of people's houses |

### PWA specifics

- `manifest.json` with a maskable icon, `display: standalone`, and a theme colour
- Service worker caching the app shell and the directory listing — most of Bolton's tradespeople are looking things up in a van with two bars of signal
- **iOS is the drop-off point.** Installing requires Safari → Share → Add to Home Screen, and most people will never find it. Detect iOS Safari and show a one-time animated prompt. This single detail will move the install rate more than anything else on the page.

### Running costs, v1

Domain ~£12/yr, ICO fee £47–52/yr, SMS £10–25/yr at low volume, hosting £0. Under £100/year before taking a penny — low enough to afford patience about Phase 1, which is the point.

---

## 10. Cold start and launch

An empty review site is worthless, and the first four weeks decide whether this becomes a habit or a link nobody clicks twice.

1. **Mine the chat.** Scroll back 24 months and extract every trader recommended and every "can anyone recommend a…" request. The first list is your directory. The *count* of the second list is the most important number in this document — it's the ceiling on demand. If it's fifteen a month, size ambitions accordingly.
2. **Consent round.** WhatsApp each trader individually with a one-tap consent link. Individually, not a broadcast — response rates are not close. Target 25 consented traders.
3. **Launch with honest gaps.** Publish the directory with traders showing "No reviews yet". A visibly new register is credible; a register with suspicious 5.0s everywhere is not.
4. **Review push.** Ask members to review one job from the last 12 months. Target 60 reviews across 25 traders in four weeks. Do this as a personal ask to individuals you know had work done — a broadcast gets six.
5. **Make it the group's reflex.** Every time someone asks for a recommendation in the chat, reply with the category link. Every time, for three months. This is the actual work, and no amount of code substitutes for it.

---

## 11. Kill criteria

Set these now, while you're objective. The most expensive outcome isn't failing — it's spending two years maintaining something that half-works because you never defined what failure looked like.

| Checkpoint | Minimum | If not met |
|---|---|---|
| Pre-build | 10 traders who pay a refundable £10 deposit | Don't build. Run it as a pinned message in the group instead |
| Day 30 | 25 live traders, 40 reviews | Consent and review push failed — fix distribution before writing more code |
| Day 90 | 80 reviews, 40 contact taps/month | Demand isn't there. Keep it running as a free community register; stop investing |
| Day 180 | Median trader 5+ taps/month | Do not attempt Phase 1. Charging for a badge on a platform nobody uses loses the group's goodwill |

> **The failure mode nobody plans for.** Not "it doesn't work". It's "everyone has 4.9 stars". If, at day 90, no trader on the platform has an average below 4.5, the reviews carry no information and the register is decorative. That's the signal to change the questions — or to accept that a 200-person town where everyone knows each other cannot produce candid public reviews, and pivot to a private, admin-curated register instead.

---

## 12. Open decisions

1. **Sole trader or limited company?** Given the defamation exposure in §6 and the representation made when issuing a verification badge in §8, form a limited company before publishing the first review. It costs £50 and is the cheapest liability insurance available.
2. **Sole owner, or is the group's admin involved?** Determines who the controller is, who carries liability, and whether you have permission to use the group as a distribution channel. Falling out with the admin at month four kills this instantly.
3. **Public reviewer names, or aggregate only?** Recommended: first name plus surname initial. It cuts both ways — reviewers are accountable for what they write, and reviews are more credible to readers. It will also suppress volume.
4. **Appetite for the ongoing job?** This isn't build-and-forget. It's a moderation queue, a consent chase, a verification check, and a nudge in the group every week for a year. If the honest answer is no, build the directory without reviews — still useful, a tenth of the work, no legal exposure.

---

## Sources

- DMCC Act 2024 review provisions, in force 6 April 2025 — [CMS](https://cms.law/en/gbr/legal-updates/no-more-faux-five-stars-the-dmcc-act-bans-fake-reviews), [CMA guidance CMA208](https://assets.publishing.service.gov.uk/media/67eeb64fe9c76fa33048c790/CMA208_-_Fake_reviews_guidance.pdf)
- Notice-and-takedown procedure — [Defamation (Operators of Websites) Regulations 2013](https://www.wrighthassall.co.uk/knowledge-base/defamation-operators-of-websites-regulations-2013)
- Data protection fee — [ICO](https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee/)
- Competitor pricing — [UK trade lead cost tracker, 2026](https://localadder.co.uk/uk-trade-lead-cost-tracker/), [SwiftLead](https://www.swiftlead.co.uk/blog/checkatrade-cost-for-tradesmen)

*This is a build specification, not legal advice. Before publishing reviews about named individuals and taking money for badges, an hour with a solicitor on §6–§8 is money well spent.*
