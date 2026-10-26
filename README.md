<div align="center">

<img src="public/icons/icon-192.png" alt="Bolton Vouched" width="96">

# Bolton Vouched

**Local people, vouched for by Bolton.**

The tradespeople Bolton's WhatsApp group recommends, in one place, with the checks we've made.
Pick a trade and an area, then call or WhatsApp them in one tap. No sign-up, no cookies to look
or call; sign in with Google or a code sent to your email to leave a review.

Made by YSB Designs, a trading name of YSB Ventures Ltd.

![Next.js](https://img.shields.io/badge/Next.js-16-6E2616?style=flat-square&labelColor=6E2616&color=9C3A25)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-6E2616?style=flat-square&labelColor=6E2616&color=9C3A25)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-6E2616?style=flat-square&labelColor=6E2616&color=9C3A25)
![Tailwind](https://img.shields.io/badge/Tailwind-4-6E2616?style=flat-square&labelColor=6E2616&color=9C3A25)
![Hosting](https://img.shields.io/badge/hosting-Render-B5862C?style=flat-square&labelColor=6E2616)
![Data region](https://img.shields.io/badge/data%20region-London-46684A?style=flat-square&labelColor=6E2616)
![Licence](https://img.shields.io/badge/licence-all%20rights%20reserved-B5862C?style=flat-square&labelColor=6E2616)

</div>

<br/>

> [!NOTE]
> **Reading this without a technical background?** Start at *The problem*, *What's
> in it* and *One request, end to end*. Those three explain what Bolton Vouched is
> and what it does for someone who needs a plumber. Everything after *How the
> pieces fit* is for whoever maintains the code.

### How to read the diagrams

Every picture in this file uses the same four colours, and they always mean the
same thing. The connectors animate, so you can see which way the information
actually travels.

| | Means |
| :--- | :--- |
| 🟥 **Brick, gold border** | Bolton Vouched itself: our code and our database |
| 🟩 **Pale sage** | Built and live today |
| 🟨 **Sand, dashed border** | In development: not built, not described as built |
| ⬜ **Stone** | A person, or something outside Bolton Vouched |

---

## The problem, in one picture

Every week someone in the Bolton Tradesmen WhatsApp group asks *"anyone know a
good…?"*. The answers are good: real people, recommended by neighbours who've
used them. Then they scroll away under a few hundred messages, and the next
person asks again.

<img src="assets/diagrams/01-the-problem.svg" alt="The same question two ways: asked in the WhatsApp group, answered, then buried in the scroll; against Bolton Vouched, where the recommended people sit by trade and area with their checks and a Call or WhatsApp button" width="100%">

Bolton Vouched keeps those answers **where you can find them**: the people the
group recommends, sorted by trade and by the BL areas they cover, with what
we've checked about them (ID, insurance, Gas Safe, DVSA and so on) and a button
to call or WhatsApp them. Every trader on it has agreed to be listed.

> [!TIP]
> **Nobody can pay to move up the list.** That sentence is the product. A listing
> is free for good, and money will never change where anyone appears.

---

## What's in it

One site: free for residents, free for traders, with an optional paid tier for traders.

<img src="assets/diagrams/02-live-and-coming.svg" alt="What is live today (the directory at the home page, eight groups of trades, profiles with checks, Call and WhatsApp, consent links and admin, free sign-in and reviews, replies and moderation, Ask Bolton, price guides, the trader dashboard and Pro with quotes and invoices) and what is built but switched off (texts, which wait for Twilio, and the scheduled payment-reminder job)" width="100%">

**Live today**

- **The directory is the home page** (`/`), and installs to the Home Screen as an app
  (a PWA, `app/manifest.ts`). Old `/platform/…` links (sent as consent, review, quote and
  invoice links, and in Google) forward to the same page without `/platform`.
- **60 trades in eight groups**: home and trades, repairs and appliances, moving and waste,
  events and occasions, personal and lessons, vehicles, travel and transport, and business
  and finance. Each can carry a short tip for customers (an estate agent's redress scheme,
  ATOL for travel agents, the legal limits on window tints). Adding one is a migration (see
  *Where things live*).
- **Provider profiles** at `/p/<slug>` with the areas they cover and the checks we've
  recorded. A trader is only listed under Gas & boilers with an in-date Gas Safe check, and
  under Driving instructors with an in-date DVSA ADI check.
- **Call and WhatsApp** buttons that go through `/api/contact`, which counts each
  tap as an enquiry and then hands over to the phone or WhatsApp. **The numbers
  are never in the page's HTML**, and one connection can open at most 60 an hour.
- **Getting listed, in one step**: a trader signs in with *I'm a trader* and fills in one
  form at `/provider`: business name, the trades they do (up to three, ticked, with a
  **Search your trade** box), the postcode areas they cover, their mobile and WhatsApp, and
  Free or Pro. Pressing **Confirm** under the listing statement is their agreement, and the
  listing goes **live straight away**, linked to their account. Gas & boilers and Driving
  instructors also ask for the Gas Safe or ADI badge number and its expiry; those go live
  without that trade until the admin has looked the number up. They land on **You're now
  live** (`/provider/live`): taking on work, their review link and QR card, and how to show
  they're vouched (their page as the website on their Google Business Profile, the badge as
  an image, or the embed code). They're emailed that they're live; Pro is paid for from there.
- **Consent**: what a trader agreed to (the IP, the text version and a SHA-256 of the exact
  statement) is kept as evidence, however they agreed. A listing the admin adds for someone
  else stays *invited* until they open their **consent link** (`/consent/<token>`) and
  agree. **For traders** (`/for-traders`) explains Free and Pro; **Get listed**
  (`/get-listed`) still takes a request without an account, which the admin turns into an
  invited listing.
- **Sign-in** at `/sign-in`: **Continue with Google** (PKCE, back through
  `/auth/callback`) or a **6-digit code sent by email** (works inside the home-screen app).
  Throwaway email domains are refused, codes are rate-limited per address and per
  connection and capped under Resend's tier, and reviews from email-only accounts wait for
  the admin's approval. Texted codes are still in the code but switched off
  (`SIGN_IN_PHONE`, see *Phone sign-in* below).
- **Reviews** at `/p/<slug>/review` (the short link and QR card use `/r/<slug>`): one
  screen of taps, live at once ("Published", or "Published, under a quick check" when an
  anti-fake rule trips), editable for 14 days, with an optional private proof photo or PDF
  (location data stripped). Profiles list them with Verified job and Group member filters,
  and the category list ranks anyone with three or more by their quality score.
- **Provider replies**: a trader who signed up is already linked to their listing. For a
  listing the admin added, the admin sends a single-use **trader sign-in link**
  (`/link/<token>`, 14 days); they open it signed in and their account is linked. Then they
  reply once to each review.
- **Taking on work**: the trader says they're taking on work (optionally "this week") or
  booked up until a date, and the admin can set or clear it too. It shows as a chip on the
  profile ("updated 3 days ago") and the cards, runs out by itself (14 days, or on the
  date), can filter a category list, and never changes the order or a badge.
- **Trader dashboard** at `/provider`: enquiries this month and all time (calls and
  WhatsApps; one per connection a day, the trader's own and the admin's taps left out), six
  months as bars, reviews this month, their review link and QR card, **Put it on Google**
  (their page link for the Website box of a Google Business Profile, tagged
  `?utm_source=google_business`), and their "Vouched in Bolton" website badge. The trader edits their description (300 characters, no phone
  numbers or web addresses) and areas, pauses and unpauses (never an admin's pause), or
  withdraws (only a new invite brings it back). Trades stay with the admin.
- **Pro** (£10 a month or £100 a year, through Stripe; see *Free and Pro*): a "Request a
  quote" button and job requests, alerts when Bolton asks for their trade, **quotes and
  invoices** sent as links (`/d/<token>`; the customer accepts a quote online, the invoice
  carries the trader's bank details), a review request when an invoice is marked paid, an
  ID check ("ID checked"), up to 6 work photos and a monthly enquiry report. Alerts go by
  email today; by text once Twilio is set up.
- **Ask Bolton** (community questions) at `/ask`: a signed-in resident asks "Anyone know a
  good electrician in BL3?" (a trade, a district and up to 280 characters; no phone numbers
  or web addresses; 3 a day, one open per trade). Questions from email-code accounts wait
  for the admin, as their reviews do. Answers must name a live listing in that trade;
  recommendations of the same trader are grouped ("Recommended by 3 people"), and a linked
  trader can't recommend themselves but can tap **I can help**. A question takes answers for
  14 days. Recommendations never touch ranking, scores or badges. Report on every question
  and answer; the admin's queue is `/admin/questions`.
- **Price guides** at `/prices` ("How much does a man and van cost in Bolton?"): only from
  reviews, a trade at a time, once it has 10 counted reviews (`price_guide_min_reviews` can
  raise it, never lower it). Each shows how many reviewers picked each of the four price
  bands, the most common band and how many said the final price matched the quote. No
  averages, hourly rates or national figures, nothing per area or per trader. Under the
  threshold the page is a 404 and isn't in the sitemap.
- **Report** on every review, and **My reviews** and **Delete account** at `/account`
  (reviews, questions and answers come down; a trader's quotes, invoices, job requests and
  bank details are deleted; the number is kept privately for 12 months).
- **Admin** at `/admin`, for the owner only, behind a password **and** an authenticator
  code. New sign-ups come first in **Providers**, marked **New, check me**, with call,
  WhatsApp and email links; the admin edits anything (silently, in the audit log; changing
  the phone number emails the trader), confirms a Gas Safe or ADI number in one press, and
  presses **Checked**. Also: add providers, record checks, copy consent and trader links,
  pause or remove; clear or remove reviews under check (with a logged reason), resolve flags
  and reports, accept proofs and ID, grant founding Pro.
- **The pre-launch lock** (`SITE_LOCK_PASSWORD`): while it's set, every page asks for one
  password, nothing is indexed, and only real shared links (a review form, a quote, a consent
  or trader link) let someone in without it. Clear the variable to open the site.

**Built, switched off or not running yet**

- **Texts**: sign-in by text and Pro's text alerts need Twilio (see *Phone sign-in*). Until
  then sign-in is Google or an email code, and alerts go by email.
- **Payment reminders** (`/api/cron/payment-reminders`) need `CRON_SECRET` and a scheduled job
  that calls it (a Render cron job, on a paid plan); until then nobody is reminded about an
  unpaid invoice.
- **Scheduled clean-ups**: old proof files are deleted from admin by hand once a month, and
  the 12-month purge of contact events isn't built.

> [!IMPORTANT]
> **Only claim what's live.** Don't promise texts, payment reminders or anything in the
> list above until it's switched on: not on the site, in the WhatsApp group, in a message to
> a trader or on a listing. Say *coming soon*, or say nothing.
> `tests/unit/no-stale-claims.test.ts` fails if old "reviews are coming" wording comes back.

---

## One request, end to end

The clearest way to explain the site is to follow one ordinary request.

<img src="assets/diagrams/03-one-request.svg" alt="A resident needs a plumber, opens the site, picks Plumber and BL4, opens a profile, taps WhatsApp; /api/contact logs one enquiry and redirects to wa.me, which opens a chat with the trader. The number is never in the page's HTML" width="100%">

Two details that matter more than they look:

- **The button is a link to our server, not to a number.** `/api/contact/<slug>?via=whatsapp`
  looks the number up on the server, logs the tap, and answers with a redirect to
  `wa.me/…` (or `tel:…` for Call). Scrapers reading the page find no phone numbers.
- **One enquiry per connection per day.** Ten taps from the same connection on the same
  day count once, and changing the browser doesn't count again, so the enquiry count is
  hard to inflate, for or against anyone. The count works on a salted hash, never on the
  IP address itself.
- **At most 60 numbers an hour per connection.** Plenty for anyone ringing round, far too
  few to scrape every trader's number from the sitemap. Link-preview bots get the trader's
  page instead of the number.

---

## How the pieces actually fit

This is the technical picture. **The browser only ever talks to our Next.js
server, and the server only ever reads providers through one view.**

<img src="assets/diagrams/04-architecture.svg" alt="Architecture: a phone or laptop reaches www.boltonvouched.co.uk (DNS at Cloudflare, pointing at Render), where Next.js 16 serves the directory and admin behind proxy.ts; it reads the provider_public view with the anon key, /api/contact uses the service key on the server only, and admin_* functions write the audit log, all in a separate Supabase project in London with Postgres RLS; GitHub Actions checks every push" width="100%">

| Piece | What it does |
| :--- | :--- |
| **Browser or PWA** | The directory at `/`. No account and no cookies to look or call |
| **`www.boltonvouched.co.uk`** | DNS at Cloudflare: `www` points at the Render service (Render issues the certificate); the bare `boltonvouched.co.uk` redirects to `www`, keeping the path |
| **`proxy.ts`** | The pre-launch lock, and session-cookie refresh on the signed-in routes only |
| **Next.js 16 on Render** | Web service `bolton-vouched` (Frankfurt), deployed from `main`. Server components and Server Actions read the database; nothing in the browser holds a key that matters, and the session cookies are HttpOnly |
| **`provider_public`** | The only public door to provider data. Live providers only, and no phone, billing, consent or document columns |
| **`private.*`** | `SECURITY DEFINER` wrappers the view calls, in a schema the public role can't even name |
| **`admin_*` functions** | Every admin write: checks the caller is an admin, then writes one `audit_log` row |
| **Postgres with RLS** | Row-level security on every table; the public roles have every default grant stripped |
| **Supabase Auth** | Google sign-in and 6-digit email codes (sent through Resend's SMTP) for residents and traders; email, password **and an authenticator app code** for the admin (`is_admin()` is only true for a session that passed the code). A trigger on `auth.users` refuses password sign-ups and any email account the app's sign-in gate didn't approve (except the admin list). Texted codes are kept but off |
| **Stripe** | Pro subscriptions: Checkout and the Customer Portal, with a signed webhook (`/api/stripe/webhook`) that applies each event once |
| **Resend** | Sign-in code emails (as Supabase's SMTP), and alert and quote/invoice emails (through its API) |
| **GitHub Actions** | Lint, types, unit tests, pgTAP database tests, browser tests and a rehearsal of the production SQL on every push and pull request. `main` only takes a change once both jobs pass |

### Why the public view, and why numbers never reach the page

It was a decision, not a shortcut. A directory of tradespeople's mobile numbers
is exactly what spammers and scrapers want, and a trader who gets cold-called
because they listed with us won't stay listed.

So the public side of the site can only see one thing, `provider_public`, and
that view simply doesn't have the phone columns. Even a bug in a page can't
leak a number, because the page never had it. The only code that reads a
number is `/api/contact`, on the server, with the service key, at the moment
someone taps the button, and what it sends back is a redirect, not a page.

What it costs, said plainly:

- **No number to copy from the page.** A resident who wants to save a number
  saves it from their call log or WhatsApp, like any other contact.
- **Every tap is a round trip** to our server before the phone or WhatsApp
  opens. It's a fraction of a second, and it's what makes the enquiry count honest.

> [!IMPORTANT]
> **Never expose phone, billing, consent or document columns** through
> `provider_public`, a new view, a new function the public roles can call, or a
> page's props. **Never add trackers, pixels, chat widgets or cookies to public
> pages.** The only analytics is Cloudflare Web Analytics, which is cookieless and off
> unless `CF_WEB_ANALYTICS_TOKEN` is set. The only cookies are the sign-in cookies
> (HttpOnly) and, while the site is locked, the lock's own cookie. `proxy.ts` refreshes
> sessions only on `/admin` and the signed-in routes (sign-in, account, review form,
> report, provider area, trader links, asking and answering), so public pages stay
> cookie-free. The theme choice lives in `localStorage` for the same reason.

### Where data goes

Only where it has to.

<img src="assets/diagrams/05-where-data-goes.svg" alt="Looking around keeps nothing; tapping Call or WhatsApp stores a salted device hash and the trader; a trader agreeing stores the IP, text version and SHA-256 of the text; admin changes go to the audit log; there are no trackers, ads or analytics SDKs on any page" width="100%">

| When… | What's kept | Where |
| :--- | :--- | :--- |
| Someone looks around | Nothing. No cookies, no account, no analytics | Nowhere |
| Someone taps Call or WhatsApp | A salted hash of the connection (HMAC with `DEVICE_HASH_SECRET`) and which trader. Not the IP, not their number | `contact_events`, readable only by the service role |
| Anything rate-limited (taps, sign-in attempts, the lock page) | A hashed connection or account key and the time, for the length of the limit (cleared within 2 days) | `rate_events` |
| A trader agrees to be listed | The IP, the consent text version and a SHA-256 of the exact text they were shown | The provider's consent evidence |
| Someone signs in | Their email address, and their Google account ID if they use Google (in Supabase Auth), the name they show ("Sarah K."), their postcode district (never public); sign-in attempts (the address or number entered, in plain text, with a hashed connection signature) for up to 30 days; an unconfirmed email account (code asked for, never used) for up to 24 hours; after deleting their account, only a peppered hash of their sign-in for 12 months | `auth.users`, `profiles`, `email_requests`, `identity_retention` |
| Someone posts a review | The answers, a salted device hash to catch fake reviews, and an optional proof file with its metadata stripped, seen only by the admin | `reviews`, `review_proofs`, the private `review-proofs` bucket |
| A resident asks a Pro trader for a quote | Their name, number, optional email, district and the job, for the trader only; deleted after 180 days | `job_requests` |
| A Pro trader sends a quote or invoice | The customer's name and contact, the items and prices, and on invoices the trader's bank details; deleted after 2 years | `trade_docs`, `trader_billing` |
| A trader pays for Pro | Stripe's customer and subscription ids and status. Card details stay with Stripe | `subscriptions`, `stripe_events` |
| Someone deletes their account | Their reviews and replies come down; a trader's quotes, invoices, job requests, bank details and alert settings are deleted (also when the admin unlinks or re-invites their listing); their number is kept for 12 months for legal claims, readable only by the database owner | `phone_retention` |
| The admin changes anything | Who, what, when and the reason | `audit_log` |

---

## The stack, in four layers

Left to right: what gets written, what it becomes, where that runs, and what it
hands the visitor off to.

<img src="assets/diagrams/06-tech-stack.svg" alt="The stack in four layers: TypeScript, React 19, Tailwind 4 and SQL migrations; a Next.js 16 app and a Postgres schema; Render and Supabase in London; the phone's dialler and WhatsApp" width="100%">

| Layer | What and why |
| :--- | :--- |
| **TypeScript**, strict | Every file. A trader's listing is not a place for `undefined` |
| **Next.js 16** · React 19 | App Router and server components, so the database is read on the server. This Next.js has breaking changes from older versions; read `node_modules/next/dist/docs/` before changing framework code (see `AGENTS.md`) |
| **Tailwind 4** | The Bolton Brick palette as tokens in `app/globals.css`, light and dark |
| **Gloock** and **Figtree** | Through `next/font`, served from our own domain, so no request goes to Google |
| **Supabase Postgres** + RLS | Schema, view, functions and policies in `supabase/migrations/`, tested with pgTAP in `supabase/tests/` |
| **Supabase Auth** | Google and email-code sign-in (codes go to a local inbox in development and CI), phone sign-in behind `SIGN_IN_PHONE`, and the admin's email sign-in |
| **zod**, **libphonenumber-js** | Every admin form is validated; numbers are stored as E.164 |
| **Render** | Web service `bolton-vouched`, from `main` |
| **GitHub Actions** | `.github/workflows/ci.yml`: the checks above on every push and pull request |

---

## This repository

```
app/               the Next.js app: (platform) directory at /, admin/, api/,
                   (info) policy and trader pages, site-lock/, manifest.ts
components/        UI: home/, category/, profile/, provider/, admin/, auth/, ui/
lib/               server code: directory reads, consent text, device hash, phone,
                   checks, Supabase clients
supabase/          migrations/, seed.sql (categories), tests/ (pgTAP)
e2e/               Playwright browser tests
tests/unit/        Vitest unit tests
scripts/           local stack, database reset and tests, screenshots, icons,
                   and the diagrams in this file
docs/design/       the Bolton Brick prototype the design follows
docs/launch/       the launch steps and the SQL to paste on launch day
assets/diagrams/   the diagrams in this file, as source and as SVG
public/            icons, showcase screenshots, the social preview image
```

### Running it locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.example` holds the local defaults, identical for both local stacks below.

You need a local Supabase. With Docker:

```bash
npx supabase start
```

Local development also needs `psql` and `pg_prove` on your PATH (the database
scripts and `npm run test:db` use them).

Without Docker (sandboxes, some laptops), use the local Supabase-compatible
stack, which serves the same URLs, ports and keys. `scripts/local-stack/README.md`
explains what runs.

```bash
npm run stack:start   # idempotent: downloads binaries once, starts, waits until healthy
npm run stack:stop
```

`npm run db:reset` (the E2E setup runs it too) drops and rebuilds schema
`public`, applies every migration, then `supabase/seed.sql`. It is meant for the
local stack and needs a superuser. With the real Supabase CLI stack, set
`SUPABASE_CLI_STACK=1` (CI does) and it runs `npx supabase db reset --local`
instead. Both refuse non-local databases.

```bash
npm run lint
npm run typecheck
npm test              # Vitest unit tests
npm run db:reset && npm run test:db   # pgTAP: needs an empty register, so reset first
npm run test:stack    # the local stack's own guard and smoke tests
PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e   # Playwright; builds and serves the app (:3000, and :3001 with phone sign-in on)
npm run db:check-prod # the one-paste production scripts apply, in order, on a 000017-state database
```

The production pastes in `docs/launch/` are generated from the migrations, one per
release, each refusing to run before the one it follows: `plan-2b` (000018 to 000025),
`launch-checklist` (000026), `review-source` (000027), `availability` (000028),
`trader-dashboard` (000029), `pro-tier` (000030), `community-questions` (000031),
`price-guides` (000032), `consent-link` (000033), `one-listing` (000034), `pro-jobs` (000035),
`quotes-invoices` (000036), `trader-sign-up` (000037), `launch-hardening` (000038),
`new-categories` (000039), `more-categories` (000040), `auto-live` (000041), `one-step`
(000042), `check-numbers` (000043), `plaster-recovery` (000044) and `builders` (000045 on), each
as `docs/launch/<name>-production.sql`. After adding or changing a migration from 000045 on,
regenerate with
`node scripts/build-production-sql.mjs --preset builders --from 20261012000045 --to <newest> --out docs/launch/builders-production.sql`
(`tests/unit/production-sql.test.ts` fails until you do). A new release gets its own preset in
that script (and the previous one's `--to` fixed), a check in `scripts/check-production-sql.sh`,
and an entry in the test.

Run `npm run test:db` straight after a reset: the scoring tests expect an empty
register, without the E2E fixtures. `npm run test:e2e` loads its own fixtures and
creates a local-only admin (`scripts/e2e-prepare.sh`); `PW_CHROMIUM_PATH` is only
needed to use a Chromium you already have.

CI (`.github/workflows/ci.yml`) runs lint, typecheck and unit tests in one job,
and in the other starts a **real** `supabase start`, resets, runs pgTAP, builds
and runs Playwright. The Docker-free stack is never used in CI.

### Admin sign-in

The admin area (`/admin`) needs two steps: the email and password, then a 6-digit code from
an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password). Supabase's
**App Authenticator (TOTP)** must be on (Authentication → Multi-Factor). Wrong passwords are
limited to 5 per address and 20 per connection, and wrong codes to 5, every 15 minutes.

Email sign-ups are refused by the database unless the address is in `settings.admin_emails`.
To create the admin:

1. Add the address to the allow-list in the SQL editor:
   `update public.settings set value = value || '["admin@example.com"]'::jsonb where key = 'admin_emails';`
2. Supabase dashboard → **Authentication → Users → Add user** (email and a long password,
   auto-confirm).
3. In the SQL editor, give that user the admin role:

   ```sql
   insert into public.profiles (user_id, role)
   select id, 'admin' from auth.users where email = 'admin@example.com'
   on conflict (user_id) do update set role = 'admin';
   ```

4. **Straight away**, sign in at `/admin/login`: the first sign-in shows a QR code to scan
   with the authenticator app (`/admin/verify`). Keep the text key under the QR code in a
   password manager. Until this is done, anyone with the password could set up their own
   phone instead.

**Lost the phone?** Remove the authenticator in the SQL editor, then sign in and set it up
again:

```sql
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = 'admin@example.com');
```

### Deploying

| Where | What |
| :--- | :--- |
| **Render**, web service *bolton-vouched* | Frankfurt, Node, `npm ci && npm run build` then `npm start`, auto-deploying from `main`. If a merge doesn't deploy, use **Manual Deploy → Deploy latest commit** on the service, or reconnect the repository (Render's GitHub app) under Settings. On the **free plan** the service sleeps after 15 minutes without visitors, and the next visitor waits around a minute while it wakes: move to Starter before sending traffic to it |
| **Supabase**, project *Bolton Vouched* | London. Its own project, sharing **nothing** (keys, users, database, storage) with any other project. Daily backups, kept 7 days |
| **Domain** `boltonvouched.co.uk` | Registered at One.com, DNS at **Cloudflare** (free): `www` pointing at the Render service (Render's custom domain shows the record); `@` A `192.0.2.1`, **proxied**, with a redirect rule `http*://boltonvouched.co.uk/*` → `https://www.boltonvouched.co.uk/${2}` (301, query kept); MX `.` (no email on the domain) |
| **Stripe** | Product *Bolton Vouched Pro* with a monthly and an annual price; webhook endpoint `https://www.boltonvouched.co.uk/api/stripe/webhook`; Customer Portal on |

Render environment variables (service → Environment). Saving a change redeploys:

| Variable | What it is |
| :--- | :--- |
| `NEXT_PUBLIC_SITE_URL` | `https://www.boltonvouched.co.uk`. Must be set: every link the site sends (consent, trader, quote and invoice links, the Google sign-in return, emails) is built from it |
| `SITE_LOCK_PASSWORD` | The pre-launch lock. Set: every page asks for this password (once per browser, 30 days) and nothing is indexed. Unset: the site is open. Changing it signs everyone out of the beta |
| `NEXT_PUBLIC_SUPABASE_URL` | The Supabase project's API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Needed by Call/WhatsApp, the consent page, sign-in, proof uploads and account deletion. Never put it anywhere else |
| `SIGN_IN_PHONE` | `off` (or unset). Only the exact value `on` shows sign-in by text and lets the Send SMS hook send; it needs the three Twilio variables and the hook secret below, which can otherwise be left out |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Phone sign-in only. Server only. Twilio Lookup, which refuses internet and virtual numbers before a code is sent. `TWILIO_LOOKUP_STUB` must **not** be set in production |
| `SUPABASE_SMS_HOOK_SECRET` | Phone sign-in only. Server only. The signing secret Supabase shows for the **Send SMS hook** (`v1,whsec_…`). Without it the hook refuses every text (fail closed) |
| `TWILIO_MESSAGING_SERVICE_SID` | Phone sign-in only. Server only. The Twilio Messaging Service (`MG…`) the Send SMS hook texts codes through. `TWILIO_SMS_STUB` must **not** be set in production |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile (free) on "Email me a code" and the admin sign-in. The site key is public (shown to the browser), the secret is server only. Both unset: no check (local, CI). Only one set: every email-code request is refused (fail closed). Supabase's CAPTCHA uses the same secret (LAUNCH.md Step 3d) |
| `DEVICE_HASH_SECRET` | Server only. A long random secret (`openssl rand -hex 32`), never `change-me`. Rate limits, enquiry counts and the lock cookie need it |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL` | Pro. Server only. A restricted key is enough (write: Checkout Sessions, Customer portal, Subscriptions, Customers; read: Prices, Products). Pro opens only when all four are set; otherwise the dashboard says "Pro opens soon" |
| `RESEND_API_KEY`, `NOTIFY_FROM` | Alert, quote and invoice emails. Server only. A key restricted to sending from the site's domain; `NOTIFY_FROM` is the sender. `NOTIFY_EMAIL_STUB` must **not** be set in production |
| `CRON_SECRET` | The payment-reminders job. Server only, 16 characters or more. Unset: the job refuses every call |
| `CF_WEB_ANALYTICS_TOKEN` | Optional. Cloudflare Web Analytics (cookieless). Read at build time |
| `GOOGLE_SITE_VERIFICATION` | Optional. The Google Search Console HTML-tag value. Read at build time |
| `TRUSTED_PROXY_HOPS` | Optional, default `1`. How many trusted proxies append to `X-Forwarded-For` in front of the app. The app reads the entry this many places from the right and ignores anything a visitor puts on the left. Ignored when `CLIENT_IP_HEADER` is set |
| `CLIENT_IP_HEADER` | Optional. A header the host sets itself and a visitor can't forge (for example `true-client-ip`). When set, the visitor's IP is read from it alone and `X-Forwarded-For` is ignored. Only set it after checking on that host that a forged value doesn't get through. **On Render, set it to `true-client-ip`**: there the rightmost `X-Forwarded-For` entry is one of Render's own proxies, so without it every visitor shares the same rate limits |
| `OWNER_LEGAL_NAME` | `YSB Ventures Ltd`, matching Companies House character for character |
| `CONTACT_EMAIL` | `support@ysbdesigns.uk` |

`OWNER_LEGAL_NAME` and `CONTACT_EMAIL` are required: in production the consent
page fails closed without them and the build fails, because the policy pages are
prerendered with them. Redeploy after changing either. **Never give a secret a
`NEXT_PUBLIC_` prefix**: those are built into the browser bundle and are public.

In Supabase:

1. **Free sign-in (Google and email codes)**: follow *Owner actions* in
   `docs/superpowers/plans/2026-10-12-plan-2b-free-sign-in.md` (Resend as custom SMTP with
   sender `noreply@ysbdesigns.uk`; the **Confirm signup** and **Magic Link** templates from
   `supabase/templates/sign-in-code.html`; Email provider with **Confirm email on, always**,
   OTP length 6, expiry 900 seconds; emails sent per hour 30; CAPTCHA with Cloudflare Turnstile
   (`docs/launch/LAUNCH.md` Step 3d); the Google provider with the
   client from Google Cloud; Site URL `https://www.boltonvouched.co.uk` and Redirect URL
   `https://www.boltonvouched.co.uk/**`).
   **"Allow new users to sign up" → on**: the database refuses password sign-ups and any
   email account the sign-in page didn't approve (`email_approve` / `bv_nonce`).
2. **Phone provider off, and the Send SMS hook off**, unless phone sign-in is switched
   on (see *Phone sign-in* below).
3. **Authentication → Rate Limits**: sign-ups and sign-ins, and token verifications, 150
   per 5 minutes. These are "per IP", but every request comes from the host, so they are
   one bucket for the whole site. The app's own limits (`settings.email_limits`,
   `settings.otp_verify_limits`) stop one visitor from using them all up.
4. **Storage**: bucket `review-proofs` exists, is **private**, 10 MB, JPEG/PNG/WebP/PDF,
   no policies (the migration creates it when Storage is there).
5. **Apply migrations through the SQL editor**: paste each new file from
   `supabase/migrations/` in order and run it (`docs/launch/LAUNCH.md` → Step 3a
   lists them, with the checks to run). On launch day also run
   `docs/launch/finish-admin-function.sql`, before the first consent link goes out.
6. **Authentication → Multi-Factor**: App Authenticator (TOTP) on. **Passwords**: minimum
   length 12, leaked-password protection on.
7. Create the admin as in *Admin sign-in*.

#### Phone sign-in (off by default)

Texted codes cost money, so they are switched off: `SIGN_IN_PHONE` unset or `off` hides
the phone form, the sign-in actions refuse and `/api/auth/sms-hook` answers 403. The
code, tables and tests stay (the E2E `phone` project runs them with the switch on).
To switch it back on, set the Twilio variables and the hook secret, `SIGN_IN_PHONE=on`, and in Supabase:

1. **Authentication → Sign In / Providers → Phone**: on. Fill in the SMS provider
   (Twilio Verify is fine): Supabase needs one configured, but once the Send SMS
   hook (step 3) is on, the hook sends every text instead. No test numbers in
   production. **"Allow new users to sign up" → on** (phone sign-up needs it; the
   database refuses unapproved email sign-ups). **Phone confirmations ("Confirm phone") →
   on, always**: the database refuses a phone account that arrives already
   confirmed, so with it off nobody can sign up. Leave the **Email** provider on,
   or the admin can't sign in. A new phone account is only accepted with the
   single-use code the sign-in page hands to Supabase (`otp_approve` /
   `bv_nonce`), and phone-only accounts can never use a password, so Supabase's
   own `/signup` endpoint can't be used to create or pre-claim an account.
2. **Authentication → Rate Limits**: SMS sent per hour **30** (the owner's choice, launch
   day included: it is project-wide and the only Supabase-side ceiling on texts); sign-ups and sign-ins,
   and token verifications, 150 per 5 minutes. These are "per IP", but every request
   comes from the host, so they are one bucket for the whole site. The app's own
   wrong-code limit (5 per number per 15 minutes, 20 per connection per hour,
   `settings.otp_verify_limits`) stops one visitor from using them all up.
3. **Authentication → Hooks → Send SMS hook → HTTPS**, URL
   `https://www.boltonvouched.co.uk/api/auth/sms-hook`. Generate the secret and
   put it in Render as `SUPABASE_SMS_HOOK_SECRET`; set `TWILIO_MESSAGING_SERVICE_SID`
   (see *Texts and the SMS bill* below). Turn the hook on **after** Render has
   redeployed with both variables.

#### Texts and the SMS bill

The app's limits (3 codes per number per 15 minutes, 10 per connection per hour,
counting an IPv6 connection's whole /64 as one,
and the monthly cap in `settings.sms_monthly_cap_gbp`, £20 by default) only see
texts that go through the sign-in page. The cap counts Twilio Lookups too: every
request that gets past the limits costs a Lookup (`settings.lookup_cost_gbp`, £0.01)
as well as a text if one goes (`settings.sms_cost_per_send_gbp`, £0.10). Supabase's own API can also text an
existing account directly with the public key. Two things close that:

- **The Send SMS hook (step 3 above).** With it on, Supabase hands every text to
  `/api/auth/sms-hook` instead of sending it. The app sends only for a request
  the sign-in page approved in the last 5 minutes, once per request
  (`sms_hook_gate`), so every text passes the limits, the Lookup and the cap.
  Anything else gets a refusal and no text. With the hook on, codes are sent by
  **Twilio Programmable Messaging** through a Messaging Service (UK alphanumeric
  sender `BoltonVouch`, *SMS Pumping Protection* on), and Supabase checks the
  codes itself, so Twilio Verify is no longer used. With the hook **off**, the
  app's cap is **not** a hard cap: direct texts are limited only by Supabase's
  hourly rate limit and by Twilio.
- **Twilio itself is the only true hard stop**, hook or not:
  - pay as you go with **prepaid credit and auto-recharge OFF**. When the balance
    runs out, texts stop. A usage trigger only sends an email;
  - a **usage alert** (Console → Monitor → Usage triggers) at £10 and £20 a month
    on SMS and Lookup, emailing the owner;
  - **Geo permissions: United Kingdom only** for SMS;
  - keep Supabase's **SMS sent per hour** at 30.

#### Group code and proof files

- The group code (Group member badge) allows **5 wrong tries per person in 24
  hours**, enforced in the database (`settings.group_code_limits`); after that the
  person sees a plain message and can try again the next day.
- **Proof files are deleted 12 months after the admin checks them** (the privacy
  notice says so; `settings.proof_retention_months`). `proof_files_due` and
  `mark_proof_files_deleted` (admin or service role) find and mark them;
  `lib/proof-retention.ts` deletes the Storage files in between. The review keeps
  its Verified job label. For now the admin runs it from **Proofs → Old proof
  files** once a month; a scheduled job belongs to Plan 5.

**Never run `supabase config push`**: `supabase/config.toml` holds dummy Twilio
settings and test phone numbers for local use and CI only.

`docs/launch/LAUNCH.md` has the launch morning step by step.

> [!CAUTION]
> **The address lives in five places.** Render's custom domain on the service, the DNS at
> Cloudflare, `NEXT_PUBLIC_SITE_URL` (every link the site sends is built from it), Supabase's
> Site URL and Redirect URLs, and the Stripe webhook endpoint. Change the domain and update
> all five in the same change, or sign-in, payments and links already sent break. The
> `CNAME` file in this repo is left over from GitHub Pages, which can't run this app; Pages
> should stay off.

### Where things live

| What you want to change | File |
| :--- | :--- |
| The directory home | `app/(platform)/page.tsx`, `components/home/` |
| A category page and the area filter | `app/(platform)/c/[category]/page.tsx`, `components/category/AreaFilter.tsx` |
| Which postcode areas are offered | `lib/districts.ts` |
| A provider's profile | `app/(platform)/p/[slug]/page.tsx`, `components/profile/` |
| How checks are shown | `lib/checks.ts`, `components/profile/ChecksList.tsx` |
| The Call and WhatsApp buttons | `components/profile/ActionBar.tsx` |
| Logging a tap and redirecting | `app/api/contact/[slug]/route.ts` |
| The device hash and rate limits | `lib/device-hash.ts`, `lib/ip-hash.ts`, `lib/rate-limit.ts` (`public.rate_allow`) |
| The consent wording and its version | `lib/consent-text.ts` (shown on the consent page and the sign-up form; `lib/consent-shared.ts` holds the browser-safe parts) |
| The consent page | `app/(platform)/consent/[token]/` |
| Sign-in (Google, email code, phone) and Welcome | `app/(platform)/sign-in/`, `app/(platform)/welcome/`, `lib/email-gate.ts`, `lib/email.ts`, `lib/sign-in-methods.ts`, `lib/otp-gate.ts`, `lib/line-type.ts` |
| Where people land after sign-in, and which paths are allowed | `lib/account-intent.ts`, `lib/safe-next.ts` |
| The Google sign-in callback | `app/(platform)/auth/callback/route.ts`, `lib/google-callback.ts` |
| Trader sign-in links (linking a trader to their listing) | `app/(platform)/link/[token]/`, `lib/trader-link.ts`, `supabase/migrations/20261012000022_trader_links.sql` |
| The trader sign-up form (trades search, areas, WhatsApp, Gas Safe and ADI numbers, Confirm) | `components/provider/TraderSetupForm.tsx`, `components/provider/TraderStart.tsx`, `app/(platform)/provider/setup-actions.ts`, `lib/trader-setup.ts`, `supabase/migrations/20261012000043_check_numbers_at_sign_up.sql` |
| *You're now live* (next steps) and Put it on Google | `app/(platform)/provider/live/page.tsx`, `components/share/GoogleProfileLink.tsx`, `lib/share.ts` |
| New sign-ups in admin (*New, check me*, Checked, confirming a number) | `app/admin/(protected)/page.tsx`, `app/admin/(protected)/providers/[id]/page.tsx`, `components/admin/ProviderForms.tsx` |
| For traders and Get listed | `app/(info)/for-traders/`, `app/(info)/get-listed/`, `lib/pro-features.ts` |
| The sign-in code email | `supabase/templates/sign-in-code.html` (pasted into Supabase's templates) |
| Throwaway email domains | `lib/disposable-email-domains.json`, `scripts/disposable-domains-sql.mjs` |
| The account page, My reviews, Delete account | `app/(platform)/account/`, `components/account/` |
| The review form and proof uploads | `app/(platform)/p/[slug]/review/`, `components/review/`, `lib/review-form.ts`, `lib/proofs.ts` |
| Reviews on profiles | `components/profile/ReviewList.tsx`, `lib/reviews.ts` |
| The provider area, dashboard and Report | `app/(platform)/provider/`, `components/provider/`, `lib/enquiries.ts`, `lib/listing-edit.ts`, `app/(platform)/report/[reviewId]/` |
| Pro: checkout, portal, ID check, work photos | `app/(platform)/provider/pro-actions.ts`, `lib/pro.ts`, `lib/stripe-webhook.ts`, `app/api/stripe/webhook/route.ts` |
| Quotes, invoices and job requests | `app/(platform)/provider/docs/`, `app/(platform)/d/[token]/`, `lib/trade-docs.ts`, `app/(platform)/provider/jobs-actions.ts` |
| Alert and customer emails | `lib/notify.ts`, `lib/alert-text.ts` |
| Review moderation | `app/admin/(protected)/reviews/`, `flags/`, `proofs/` |
| Posting rules and the anti-fake checks | `supabase/migrations/20261012000004_review_posting.sql`, `…000005_review_flags.sql` |
| Admin pages and actions | `app/admin/(protected)/`, `lib/admin.ts` |
| Admin sign-in and the authenticator step | `app/admin/login/`, `app/admin/verify/`, `components/admin/VerifyForm.tsx` |
| Categories and groups | `supabase/seed.sql` and a new migration (with its production script), plus the icon in `components/CategoryIcon.tsx`, search words in `lib/trade-words.ts` and price-guide words in `lib/price-guides.ts` |
| What the public can read | `supabase/migrations/20261011000003_public_view_rls.sql` |
| Enquiry logging and counting | `supabase/migrations/20261011000004_contact_events.sql`, `…000029_trader_dashboard.sql`, `lib/tap-actor.ts` |
| Admin functions and the audit log | `supabase/migrations/20261011000005_admin_consent.sql` |
| Privacy, terms, how ratings work, review and fake-reviews policies | `app/(info)/`, `components/PolicyPage.tsx` (the draft banner) |
| Owner and contact on the policy pages | `lib/policy-config.ts` |
| Old-link redirects | `next.config.ts` |
| The pre-launch lock | `lib/site-lock.ts`, `lib/lock-grant.ts`, `app/site-lock/route.ts` |
| Session cookies and the lock, per request | `proxy.ts`, `lib/supabase/cookie-options.ts` |
| Security headers (CSP, HSTS, frames, referrer) | `lib/security-headers.ts` |
| Installing to the Home Screen | `app/manifest.ts`, `scripts/make-icons.mjs` |
| Colours and type, light and dark | `app/globals.css`, `app/layout.tsx` |

---

## Free and Pro

| | |
| :--- | :--- |
| **Residents** | Free. No account to look or call |
| **A basic listing** | Free, for good: the page, Call and WhatsApp, reviews, the review link and QR card, the enquiry count, the *Taking on work* switch and the website badge |
| **Pro**, optional | £10 a month or £100 a year, through Stripe, for any listed trader: job requests, alerts, quotes and invoices, review requests, ID check, work photos and a monthly report (`lib/pro-features.ts`). The admin can grant *founding Pro* free for a set time |

Rules that hold whatever happens with Pro:

- **The basic listing is free forever.** Nobody is removed, hidden or moved down
  for not paying.
- **Payment never affects ranking.** A trader's place in the list comes from
  reviews only. Pro never includes a position, a score or a badge that ranks.
- **Pro is offered, never pushed.** It's on the For traders page and the dashboard; nobody
  is chased to upgrade.

> [!NOTE]
> "Verified" means the admin's recorded checks, not Pro. Pro's own public mark is
> "ID checked", once the admin has seen the trader's photo ID.

---

## Security

A baseline security audit (October 2026) found the core sound and fixed the rest in
migration 000038 and PR #31. What holds, and where it's tested:

- **Every table has row-level security and no direct grants** to visitors or signed-in
  users; all access goes through views and `SECURITY DEFINER` functions that pin their
  search path and check the caller owns the record (or is the admin). A pgTAP test fails if
  any public function becomes callable without signing in
  (`supabase/tests/launch_hardening.test.sql`).
- **The admin needs two steps**, and the database agrees (`is_admin()` needs `aal2`).
- **Rate limits** on the things worth abusing: sign-in codes, admin passwords and codes,
  phone-number lookups, the lock page, the search beacon, and emails to customers (30 a day
  per listing).
- **No open redirects**: every "send them back to" path goes through `lib/safe-next.ts`.
- **Webhooks are signed** (Stripe, Supabase's Send SMS hook) and fail closed without their
  secret; the cron job needs its bearer secret.
- **Headers**: a CSP, HSTS, no framing, `nosniff`, a strict referrer policy (none on token
  pages), no `X-Powered-By`.
- **CI** runs with a read-only token and pinned actions; Dependabot proposes updates weekly.

Known gaps, in order: quote and invoice links don't expire, traders' alert destinations
aren't verified by a code, inline scripts are still allowed by the CSP, there's no error
monitoring yet, and the payment-reminder and clean-up jobs aren't scheduled.

---

## When something goes wrong

Most problems are a listing problem, and the owner fixes those in admin. The
rest is a bug, and a fix reaches everyone, not only the person who reported it.

<img src="assets/diagrams/07-support.svg" alt="Support path: something is wrong; raise a ticket by email or WhatsApp Business; a listing problem is fixed in admin, with removal within one working day; a site problem is reproduced, fixed with a test, checked in CI, merged to main and deployed by Render to everyone, and we reply" width="100%">

### Who fixes what

| It is… | Who | How |
| :--- | :--- | :--- |
| A wrong detail on a listing | **The owner**, in admin | Edit the provider; it's in the audit log |
| A new sign-up | **The owner**, in admin → Providers | It's already live. Check it (the *New, check me* badge), fix anything, confirm any Gas Safe or ADI number, press **Checked** |
| A trader wants to come off | **The owner**, in admin | Removed within one working day of asking |
| A complaint about a trader | **The owner** | Pause the listing in admin while it's looked into |
| A reported or flagged review | **The owner**, in admin → Reviews / Flags | Clear it, or remove it with a reason (kept in the audit log). Never because a trader disagrees |
| A page that breaks, a wrong count | **Whoever maintains the code** | Reproduce, add a failing test, fix, merge to `main` |
| The site is down | **Whoever maintains the code** | Render's logs and events for the service, then Supabase's status |

Support is a ticket: email **support@ysbdesigns.uk**, or WhatsApp Business on
**07466 487591**. The site's contact links open an email with a
*Bolton Vouched: …* subject; the address is `CONTACT_EMAIL` in
`components/site/content.ts` and the `CONTACT_EMAIL` variable on Render.

---

## Before launch

> [!WARNING]
> **The site doesn't show the registered office address yet.** The Companies Act
> requires a company's website to show its name, number and registered office.
> The name and number are on the site (`components/site/content.ts`). The
> registered office is the owner's home, so it stays off this public repo until
> the company moves to a registered office service; then add that address to
> the site footer and the privacy notice.

- [ ] **Legal review of the draft policy pages** (`/privacy`, `/terms`,
      `/how-ratings-work`, `/review-policy`, `/fake-reviews-policy`), then remove the
      *Draft — pending legal review* banner (`DRAFT_BANNER` in `components/PolicyPage.tsx`).
- [ ] **Register YSB Ventures Ltd with the ICO** (the data protection fee) as the
      controller for Bolton Vouched.
- [ ] **Render on a paid plan (Starter)**, so the site doesn't sleep after 15 idle minutes and
      make the next visitor wait around a minute.
- [ ] **`SITE_LOCK_PASSWORD` set** until launch day, then cleared.
- [ ] **Cloudflare Turnstile** keys on Render (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`).
- [ ] **Licence checks for taxis and private hire.** Before a taxi, minibus or
      airport-transfer listing goes live, check the council private hire or
      hackney licence (and an operator licence for minibuses with a driver) and
      record it as a check.
- [ ] **Build the 12-month purge of contact events.** The privacy notice states
      12-month retention; the job isn't built yet.
- [ ] **Delete old proof files monthly** (admin → Proofs → Old proof files) until it's
      scheduled.
- [ ] **Payment reminders**: `CRON_SECRET` and a scheduled job calling it (`docs/launch/LAUNCH.md`,
      *Pro part 3*).
- [ ] **Texts**, when wanted: the Twilio steps in *Texts and the SMS bill*, then
      `SIGN_IN_PHONE=on` for sign-in by text.
- [x] `OWNER_LEGAL_NAME` and `CONTACT_EMAIL` set on Render.
- [x] The domain: `www.boltonvouched.co.uk` on Render with a valid certificate, the bare domain
      redirecting.
- [x] Every production script up to `builders` applied; the admin's authenticator set up.
- [x] `CLIENT_IP_HEADER=true-client-ip` on Render, so rate limits see each visitor.
- [x] Free sign-in (Google and email codes) live.
- [x] Stripe live, with a restricted key.
- [x] Supabase daily backups, leaked-password protection, App Authenticator on.
- [x] Branch protection on `main` (both CI jobs required).

---

## Before you change any copy

> [!CAUTION]
> **Never claim something is live before it is.** Not on the site, not in a message to a
> trader, not in the WhatsApp group. Reviews, replies, Ask Bolton, price guides, Google and
> email sign-in and Pro are live, so say so plainly. Texts are switched off: don't tell
> anyone to sign in with their mobile, or a Pro trader that alerts come by text, until
> Twilio is set up. The same goes for payment reminders.

Four more that catch people out:

- **Nobody can pay to rank.** Don't write anything that suggests Pro, Verified
  or anything else can move a trader up the list.
- **Any change to the consent wording bumps `CONSENT_TEXT_VERSION`** in
  `lib/consent-text.ts`. The version and a hash of the exact text are stored with
  each consent as evidence, so the wording and the version must always match.
- **No phone digits in public HTML.** Not in copy, not in a page's props, not in
  structured data. Numbers only leave through `/api/contact`.
- **Draft pages say they're drafts** until a solicitor has reviewed them.

British English throughout: *colour*, *licence* (the noun), *postcode*, and
prices in **£**.

---

## The diagrams

Seven SVGs, and the connectors animate. GitHub renders mermaid but can't animate
it, so these are built rather than inlined. The sources stay in the repo as text,
so a diagram is still something you can edit and diff:

```bash
assets/diagrams/*.mmd             # the source, one file per diagram
node scripts/build-diagrams.mjs   # regenerates the SVGs
```

The build script holds the palette and the animation in one place. It declares
the Bolton Brick colours light-first and redefines them under
`prefers-color-scheme`, so the diagrams follow GitHub's theme. It also keeps a
`prefers-reduced-motion` guard, so anybody who has asked their machine for less
movement gets a still picture, the same rule the site follows.

> [!NOTE]
> **Do not add a `font-family` override to that stylesheet.** Mermaid sizes every
> box for the font it measured with *before* the stylesheet is added, so changing
> the face afterwards clips the last line of a label.

Rendering uses mermaid-cli through `npx` and needs a Chromium. If the machine has
one already:

```bash
PUPPETEER_EXECUTABLE_PATH=/path/to/chrome node scripts/build-diagrams.mjs
```

---

## Licence

All rights reserved, YSB Ventures Ltd. Not open source. The Gloock and Figtree
fonts are under the SIL Open Font Licence, and every other library is under its
own licence.
