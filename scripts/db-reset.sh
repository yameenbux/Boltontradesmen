#!/usr/bin/env bash
# Reset the public schema and re-apply supabase/migrations/*.sql (filename order)
# and supabase/seed.sql. The psql path is for the local stack (scripts/local-stack),
# where postgres is a superuser. With SUPABASE_CLI_STACK=1 (the real Supabase CLI
# stack, as in CI) it runs `supabase db reset` instead, which applies the same
# migrations and seed.sql under Supabase's own ownership model (ruling R16).
set -euo pipefail
cd "$(dirname "$0")/.."
SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

# shellcheck source=local-db-guard.sh
source "$(dirname "$0")/local-db-guard.sh"
assert_local_db

if [ "${SUPABASE_CLI_STACK:-}" = 1 ]; then
  echo "[db-reset] SUPABASE_CLI_STACK=1: running supabase db reset --local"
  npx supabase db reset --local --yes
  exit 0
fi

PSQL=(psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1)

echo "[db-reset] dropping schema private, recreating schema public"
"${PSQL[@]}" <<'SQL'
drop schema if exists private cascade;
drop schema if exists public cascade;
create schema public authorization postgres;
comment on schema public is 'standard public schema';
grant usage on schema public to public;
grant all on schema public to postgres;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
SQL

shopt -s nullglob
migrations=(supabase/migrations/*.sql)
if [ ${#migrations[@]} -eq 0 ]; then
  echo "[db-reset] no migrations in supabase/migrations"
fi
for f in "${migrations[@]}"; do   # glob expansion is sorted by filename
  echo "[db-reset] applying $f"
  "${PSQL[@]}" -f "$f"
done

if [ -f supabase/seed.sql ]; then
  echo "[db-reset] seeding supabase/seed.sql"
  "${PSQL[@]}" -f supabase/seed.sql
fi

"${PSQL[@]}" -c "notify pgrst, 'reload schema'"
echo "[db-reset] done"
