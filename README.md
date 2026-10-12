# Bolton Vouched

A local recommendations directory for Bolton, UK: local people, vouched for by Bolton. Built with Next.js (App Router), Tailwind and Supabase.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

### Environment variables (`.env.example`)

| Key | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key |
| `DEVICE_HASH_SECRET` | Server-only secret for hashing device identifiers |
| `NEXT_PUBLIC_SITE_URL` | Public site URL |
| `OWNER_LEGAL_NAME` | Legal name of the site owner (data controller); shown on the consent page and privacy notice |
| `CONTACT_EMAIL` | Public contact address for privacy requests and content reports |
| `SUPABASE_DB_URL` | Postgres URL used by `npm run test:db` |

### Local Supabase

```bash
npx supabase start
```

Requires Docker. Local development also needs `psql` and `pg_prove` on your PATH (used by the DB scripts and `npm run test:db`).

In sandboxes without Docker, use `npm run stack:start` (and `npm run stack:stop`), which starts an equivalent local stack with the same defaults as `.env.example`.

`npm run db:reset` (also run by the E2E setup) drops and rebuilds schema `public` with `psql`, which needs a superuser and is meant for that sandbox stack. With the real Supabase CLI stack set `SUPABASE_CLI_STACK=1` (CI does) so it runs `npx supabase db reset --local` instead. Both refuse non-local databases. Run `npm run test:db` right after a reset: the scoring tests expect an empty register, without the E2E fixtures.

### Admin sign-in

The admin area (`/admin`) uses Supabase email + password. Public sign-ups are disabled. To create the real admin:

1. Supabase dashboard -> Authentication -> Users -> Add user (email + password, auto-confirm).
2. In the SQL editor, give that user the admin role:

   ```sql
   insert into public.profiles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com'
   on conflict (user_id) do update set role = 'admin';
   ```

The E2E suite creates `admin@example.test` / `e2e-admin-password` itself (`scripts/e2e-prepare.sh`); local databases only.

## Scripts

- `npm run dev` / `build` / `start`
- `npm run lint`, `npm run typecheck`
- `npm test` - Vitest unit tests
- `npm run test:db` - pgTAP tests via `pg_prove` (needs a running local Supabase)
- `npm run test:e2e` - Playwright (builds and serves the app; set `PW_CHROMIUM_PATH` to use a custom Chromium)

## Deploy

1. **Supabase project.** Create a project in the London region (the privacy notice says data is stored in the UK).
2. **Push the schema.** `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. **Create the admin user and set the role.** Follow "Admin sign-in" above.
4. **Disable sign-ups.** Supabase dashboard -> Authentication -> Sign In / Providers -> turn off "Allow new users to sign up".
5. **Vercel environment variables** (Production, and Preview too: preview builds prerender pages from the database and fail without them):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from the Supabase project.
   - `DEVICE_HASH_SECRET`: a strong random secret (for example `openssl rand -hex 32`). Do not reuse `change-me`.
   - `NEXT_PUBLIC_SITE_URL`: the public URL of the site (for example `https://boltonvouched.co.uk`). Must be set: without it, provider consent links copied from the admin area are relative paths that do not work when sent to a provider.
   - `OWNER_LEGAL_NAME` and `CONTACT_EMAIL`: required. In production the provider consent page fails closed (it will not render) without them, and the privacy notice and terms use them.
   - Never give a secret (`SUPABASE_SERVICE_ROLE_KEY`, `DEVICE_HASH_SECRET`) a `NEXT_PUBLIC_` prefix: `NEXT_PUBLIC_` variables are inlined into the browser bundle and are public.
6. **Policy pages.** `/privacy`, `/terms` and `/how-ratings-work` carry a "Draft — pending legal review" banner. Have them reviewed, then remove the banner (`DRAFT_BANNER` in `components/PolicyPage.tsx`) before launch. They are prerendered at build time, so redeploy after changing `OWNER_LEGAL_NAME` or `CONTACT_EMAIL`; in production the build fails if either is unset.

## Before launch

- [ ] Set `OWNER_LEGAL_NAME` and `CONTACT_EMAIL`, deploy, and verify `/privacy` shows them. Production values:
  - `OWNER_LEGAL_NAME=YSB Ventures Ltd` (check the exact registered name on Companies House and match it character for character)
  - `CONTACT_EMAIL=support@ysbdesigns.uk`
- [ ] Register YSB Ventures Ltd with the ICO (data protection fee) as the controller for Bolton Vouched.
- [ ] The 12-month contact-event purge job is not yet built (planned). The privacy notice states the 12-month retention policy, so build the job before relying on it.
- [ ] Legal review of all draft pages (`/privacy`, `/terms`, `/how-ratings-work`), then remove the draft banner.
