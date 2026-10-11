#!/usr/bin/env bash
# Reset the public schema and re-apply supabase/migrations/*.sql (filename order)
# and supabase/seed.sql. Intended for the local stack (scripts/local-stack);
# with the real Supabase CLI use `npx supabase db reset` instead.
set -euo pipefail
cd "$(dirname "$0")/.."
SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PSQL=(psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1)

echo "[db-reset] recreating schema public"
"${PSQL[@]}" <<'SQL'
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
