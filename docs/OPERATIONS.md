# Bolton Vouched: how it runs

What's live, where it runs, and how to change it. Checked against the live services on 29 October 2026; update this
file whenever any of it changes. (docs/launch/LAUNCH.md is the historical launch-morning checklist, from when the site
ran on Railway.)

## Where things are

| Piece | Where | Notes |
|---|---|---|
| Website | Render web service **bolton-vouched**, region **Frankfurt**, Starter plan (0.5 CPU, 512 MB), one instance | https://www.boltonvouched.co.uk. Built with `npm ci && npm run build`, started with `npm start`. |
| Database, sign-in, file storage | Supabase project **mmarznvndvbwyhhtbfjy**, London | Every table blocks direct access by default (row-level security); the site reads and writes through checked database functions. |
| Pro payments | Stripe (live), Stripe Billing | Webhook: `/api/stripe/webhook`. |
| Traders' card payments | Stripe Connect, direct charges on the trader's own account, no application fee | Webhook: `/api/stripe/connect`. Hidden unless `STRIPE_CONNECT_WEBHOOK_SECRET` is set. |
| Email | Resend, from `Bolton Vouched <noreply@ysbdesigns.uk>` | |
| Texts | Twilio, **not switched on** | No page or term promises a text until the Twilio settings are set (`textsAvailable()`). |
| Security check on forms | Cloudflare Turnstile | |
| Visit counts | Cloudflare Web Analytics, plus the site's own page views (admin sign-up card, trader dashboards) | |
| Facebook spotlights | Metricool brand 2910993, **Facebook only** (the brand also holds another organisation's Instagram, which must never be posted to) | See below. |
| Code | GitHub yameenbux/Boltontradesmen, branch `main` | |

## Settings (environment variables)

The full list, with what each does, is `.env.example`. Secrets are set on Render (service → Environment) and never in
the repo. Notable switches:

- `CLIENT_IP_HEADER=true-client-ip`: required on Render (see `lib/client-ip.ts`).
- `CRON_SECRET`: **not set**, so the daily job doesn't run (see below).
- Twilio settings: **not set**, so texts are off.
- `SITE_LOCK_PASSWORD`: not set, so the site is open.

## Deploying

The code reaches the site when a pull request is merged into `main`. Before merging, CI runs lint, the type check,
the unit tests, the database tests and the browser tests.

**Known problem:** Render's auto-deploy is switched on, but it doesn't fire on new commits. Every deploy so far was
started by hand. Until that's fixed, deploy from the Render dashboard (bolton-vouched → Manual Deploy → Deploy latest
commit) after each merge.

## Changing the database

1. Add a migration in `supabase/migrations/` and its pgTAP tests in `supabase/tests/`.
2. `npm run db:reset && npm run test:db` locally.
3. Build the production script:
   `node scripts/build-production-sql.mjs --preset <name> --from <first> --to <last> --out docs/launch/<name>-production.sql`.
   `npm run db:check-prod` rehearses every script against a copy of production's state.
4. Paste the script into Supabase → SQL Editor and run it. It's one transaction that checks its own prerequisite and
   rolls back if anything is missing.

Latest migration applied live: **20261012000057** (traffic sources).

## Scheduled work

| Job | Status | What it does |
|---|---|---|
| Daily job `/api/cron/daily` | **Not running**: needs `CRON_SECRET` set and a scheduler calling it with `Authorization: Bearer <secret>` | Payment reminders on overdue Pro invoices, follow-up emails on unanswered Pro quotes, clearing page views older than 13 months. No page promises these while it isn't set up (`dailyJobConfigured()`). |
| Facebook spotlights | Running daily at 17:47 UK time, as a Claude scheduled task bound to one Claude Code session | Finds traders the admin checked in the last 24 hours and schedules each a spotlight at 19:30, one per evening, from `/p/<slug>/spotlight.txt` and `/p/<slug>/spotlight.png`. If that session is deleted or archived, it stops. |

## Monitoring and backups

- Error tracking: **none yet**.
- Uptime check: **none confirmed**.
- Backups: depend on the Supabase plan. **To check:** Supabase → Project Settings → Add-ons / Backups, and write
  the restore steps here.

## Promises to traders

Every Pro and Free promise is pinned in `tests/unit/pro-promises.test.ts`. The terms and the invoice page mention
texts and payment reminders only while those run (`tests/unit/no-stale-claims.test.ts`). Changing a promise means
checking it works in production first, then updating that test in the same change.

## Legal

The policy pages are drafts pending a solicitor's review. The brief for that review is
[docs/legal/solicitor-brief.md](legal/solicitor-brief.md).
