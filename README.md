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
| `SUPABASE_DB_URL` | Postgres URL used by `npm run test:db` |

### Local Supabase

```bash
npx supabase start
```

Requires Docker.

## Scripts

- `npm run dev` / `build` / `start`
- `npm run lint`, `npm run typecheck`
- `npm test` - Vitest unit tests
- `npm run test:db` - pgTAP tests via `pg_prove` (needs a running local Supabase)
- `npm run test:e2e` - Playwright (builds and serves the app; set `PW_CHROMIUM_PATH` to use a custom Chromium)
