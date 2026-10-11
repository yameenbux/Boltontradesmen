#!/usr/bin/env bash
# Reset the public schema and re-apply supabase/migrations/*.sql (filename order)
# and supabase/seed.sql. Intended for the local stack (scripts/local-stack);
# with the real Supabase CLI use `npx supabase db reset` instead.
set -euo pipefail
cd "$(dirname "$0")/.."
SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

# Safety: this drops schema public, so only run against a local database unless
# explicitly overridden. Hosts come from the URL authority and any ?host= param
# (libpq lets the latter win); an empty host means a local Unix socket.
db_hosts="$(node -e '
  try {
    const u = new URL(process.argv[1]);
    if (!/^postgres(ql)?:$/.test(u.protocol)) throw 0;
    const hosts = [u.hostname, ...u.searchParams.getAll("host")]
      .flatMap((h) => h.split(","))
      .map((h) => decodeURIComponent(h).replace(/^\[|\]$/g, ""));
    if (!u.hostname && !u.searchParams.has("host") && process.env.PGHOST) hosts.push(...process.env.PGHOST.split(","));
    console.log(hosts.join(" "));
  } catch { process.exit(1); }
' "$SUPABASE_DB_URL")" || db_hosts="<unparseable>"
if [ "${ALLOW_NONLOCAL_DB_RESET:-}" != 1 ]; then
  for h in $db_hosts; do
    case "$h" in
      127.0.0.1|localhost|::1|/*) ;;
      *)
        echo "[db-reset] refusing to reset non-local database host '$h' (SUPABASE_DB_URL)." >&2
        echo "[db-reset] Only 127.0.0.1, localhost and ::1 are allowed; set ALLOW_NONLOCAL_DB_RESET=1 to override." >&2
        exit 2
        ;;
    esac
  done
fi

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
