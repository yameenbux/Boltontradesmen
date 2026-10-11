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
5. **Vercel environment variables** (Production):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from the Supabase project.
   - `DEVICE_HASH_SECRET`: a strong random secret (for example `openssl rand -hex 32`). Do not reuse `change-me`.
   - `NEXT_PUBLIC_SITE_URL`: the public URL of the site.
   - `OWNER_LEGAL_NAME` and `CONTACT_EMAIL`: required. In production the provider consent page fails closed (it will not render) without them, and the privacy notice and terms use them.
6. **Policy pages.** `/privacy`, `/terms` and `/how-ratings-work` carry a "Draft — pending legal review" banner. Have them reviewed, then remove the banner (`DRAFT_BANNER` in `components/PolicyPage.tsx`) before launch. They are prerendered at build time, so redeploy after changing `OWNER_LEGAL_NAME` or `CONTACT_EMAIL`.
