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
npm run stack:stop    # stops proxy, PostgREST and Auth; leaves Postgres running
```

## What runs

| Component | Address | Notes |
| --- | --- | --- |
| Postgres 16 (cluster `16/supa`) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | Created with `pg_createcluster` on first start; needs root or sudo. Stop with `pg_ctlcluster 16 supa stop`. |
| Gateway (`proxy.mjs`) | `http://127.0.0.1:54321` | `/rest/v1/*` → PostgREST, `/auth/v1/*` → Auth, prefix stripped, headers forwarded, permissive CORS. |
| PostgREST v12.2.3 | `127.0.0.1:54330` (internal) | Connects as `authenticator`; schema `public`; anon role `anon`. |
| Supabase Auth v2.177.0 | `127.0.0.1:54331` (internal) | Connects as `supabase_auth_admin`; runs its own migrations into schema `auth`. Email auth with autoconfirm; **phone sign-ups on, gated by the database** (the `auth.users` guard refuses phones the app did not approve and email-only accounts not in `settings.admin_emails`); test OTPs listed in `supabase/config.toml` (`[auth.sms.test_otp]`). |

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
- `proxy.mjs` — the gateway. `jwt.mjs` — key signing.
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

## Differences from `supabase start`

No Storage, Realtime, Studio, Inbucket/Mailpit, edge functions or `graphql_public`.
`db:reset` only rebuilds `public` and `private` (auth users survive a reset). Add pieces here
only when a task needs them.
