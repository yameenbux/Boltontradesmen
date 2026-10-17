# Local Supabase-compatible stack

A Docker-free stand-in for `npx supabase start`, for sandboxes where Supabase's
Docker images cannot be pulled. It exposes the **same URLs, ports and keys** as
the Supabase CLI, so the app, `.env.example`, pgTAP tests and E2E tests work
unchanged against either.

## When to use which

| Situation | Use |
| --- | --- |
| Docker available (your laptop, CI) | `npx supabase start` / `npx supabase db reset` |
| No Docker (sandboxed agents, this container) | `npm run stack:start` / `npm run db:reset` |

CI always uses the real `supabase start`; this stack is never used there.
Only one of the two can run at a time (they bind the same ports).

## Commands

```bash
npm run stack:start   # idempotent; downloads binaries once, starts everything, waits until healthy
npm run db:reset      # recreate schema public, apply supabase/migrations/*.sql, then supabase/seed.sql
npm run test:stack    # smoke test (also passes against a real `supabase start`)
npm run test:db       # pgTAP tests in supabase/tests via pg_prove
npm run stack:stop    # stops proxy, PostgREST, Auth and the mail sink; leaves Postgres running
```

## What runs

| Component | Address | Notes |
| --- | --- | --- |
| Postgres 16 (cluster `16/supa`) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | Created with `pg_createcluster` on first start; needs root or sudo. Stop with `pg_ctlcluster 16 supa stop`. |
| Gateway (`proxy.mjs`) | `http://127.0.0.1:54321` | `/rest/v1/*` → PostgREST, `/auth/v1/*` → Auth, prefix stripped, headers forwarded, permissive CORS. |
| PostgREST v12.2.3 | `127.0.0.1:54330` (internal) | Connects as `authenticator`; schema `public`; anon role `anon`. |
| Supabase Auth v2.177.0 | `127.0.0.1:54331` (internal) | Connects as `supabase_auth_admin`; runs its own migrations into schema `auth`. Email codes **without** autoconfirm (6 digits, 15 minutes, sent to the mail sink), Google with a dummy client, **phone sign-ups on**, all gated by the database (the `auth.users` guard refuses phone and email sign-ups without the nonce of a request the app approved, and password sign-ups; admin emails are allow-listed in `settings.admin_emails`); test OTPs listed in `supabase/config.toml` (`[auth.sms.test_otp]`). |
| Mail sink (`mail-sink.mjs`) | SMTP `127.0.0.1:54325`, HTTP `127.0.0.1:54324` | Dependency-free local inbox; see *Email codes* below. |

JWT secret: `super-secret-jwt-token-with-at-least-32-characters-long`.
`node scripts/local-stack/jwt.mjs` prints the anon and service_role keys; they
are byte-identical to the Supabase CLI's well-known local demo keys.

`shim.sql` (applied on every start) creates the Supabase roles (`anon`,
`authenticated`, `service_role`, `authenticator`, `supabase_auth_admin`), the
`auth` and `extensions` schemas, the `pgcrypto` and `pgtap` extensions (in
`extensions`, which is on the database `search_path`) and the default grants on
`public`. `auth.uid()`, `auth.role()` and `auth.jwt()` come from Auth's own
migrations and read `request.jwt.claim.sub` / `request.jwt.claims`, so pgTAP
tests can do:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
```

## Files

- `start.sh`, `stop.sh` — lifecycle. PID files in `run/`, logs in `logs/`, binaries in `bin/` (all git-ignored).
- `shim.sql` — idempotent roles/schemas/extensions setup.
- `proxy.mjs` — the gateway. `jwt.mjs` — key signing. `mail-sink.mjs` — the local inbox.
- `smoke.test.sh` — the stack's acceptance test.
- `../db-reset.sh` — schema reset + migrations + seed (`ON_ERROR_STOP=1`), then `NOTIFY pgrst, 'reload schema'`.
  Refuses any non-local host (only 127.0.0.1, localhost, ::1) unless `ALLOW_NONLOCAL_DB_RESET=1`.
- `db-reset-guard.test.sh` — hermetic test of that guard (fake `psql`, no database touched); part of `npm run test:stack`.

## Phone sign-in

Phone OTP runs with a dummy Twilio provider (Auth builds the SMS provider before it looks for a
test OTP; a test OTP then skips sending). The test numbers are `447700900301` (Ace Plumbing's
listing number in the E2E fixture) and `447700900401`–`447700900409` (residents), each with code
`123456`. They are set by `GOTRUE_SMS_TEST_OTP` in `start.sh` and `[auth.sms.test_otp]` in
`supabase/config.toml`; `tests/unit/test-otp-config.test.ts` keeps the two lists identical. A number
still needs an approved `otp_requests` row (the app's sign-in gate writes one) in the last 15 minutes
before Auth can create its account. After changing Auth settings run `npm run stack:stop && npm run stack:start`.

Phone sign-in is off unless the app runs with `SIGN_IN_PHONE=on`. The E2E `phone` project serves the app with
it on at `http://localhost:3001`, so Auth's Send SMS hook points there
(`http://localhost:3001/api/auth/sms-hook`; set `SMS_HOOK_URL` before `stack:start` to point it elsewhere, for
example at `npm run dev` on :3000 with `SIGN_IN_PHONE=on`).

## Email codes and Google (Plan 2b)

**Which inbox CI has: Mailpit.** Supabase CLI 2.x (CI pins 2.120.0) runs Mailpit, not Inbucket, as the
local email server on port 54324 (`supabase status` prints "Mailpit URL"; the `[local_smtp]` section of
`supabase/config.toml`). `npx supabase start` could not be run here (no Docker daemon in this sandbox), so
this rests on the Supabase CLI docs and `supabase status` output in the CLI's issue tracker; if CI ever
shows Inbucket instead, switch `mail-sink.mjs`, `e2e/helpers/mailbox.ts` and `smoke.test.sh` together.

Both stacks therefore expose the same subset of **Mailpit's API** on `http://127.0.0.1:54324`:

- `GET /api/v1/search?query=to:"<address>"` → `{ messages: [{ ID, Created, Subject, … }] }`, newest first
- `GET /api/v1/message/<ID>` → `{ Text, HTML, Subject, From, To, … }`
- `DELETE /api/v1/messages` (body `{"IDs":[…]}` deletes those; no body deletes everything)

`mail-sink.mjs` implements only that (plus `GET /api/v1/messages`), keeps messages in memory, and also serves
`GET /templates/sign-in-code.html` (the repo's `supabase/templates/sign-in-code.html`), which Auth fetches
for both the "confirmation" and "magic link" emails (`GOTRUE_MAILER_TEMPLATES_*`). Sender
`noreply@ysbdesigns.uk` ("Bolton Vouched"), subject "Your Bolton Vouched sign-in code", 6-digit codes that
expire after 900 seconds. `tests/unit/auth-email-config.test.ts` keeps `start.sh` and `supabase/config.toml`
in step. E2E reads codes with `latestCode()` (`e2e/helpers/mailbox.ts`); E2E addresses use
`@residents.example.test`, whose accounts `db:reset` deletes.

A new email account still needs an approved `email_requests` row bound to the app's nonce (the sign-in page
writes one) in the last 15 minutes before Auth can create it.

Google uses a dummy client (`local-dummy.apps.googleusercontent.com`): `GET /auth/v1/authorize?provider=google`
redirects to `https://accounts.google.com/…`, and tests stop there. Never `supabase config push`.

## Differences from `supabase start`

No Realtime, Studio, edge functions or `graphql_public`; the inbox is the mail sink above, not Mailpit's UI.
Storage is a small file-backed stand-in (`storage.mjs`, served by the gateway under `/storage/v1`): upload, remove
and signed links with the service role key, and public reads for the buckets in `STORAGE_PUBLIC_BUCKETS`
(default `work-photos`). Files are kept in `run/storage/`. There is no `storage` schema, so the migrations skip
creating buckets here, and bucket size and type limits are not enforced (the app checks both itself).
`db:reset` only rebuilds `public` and `private` (auth users survive a reset). Add pieces here
only when a task needs them.
