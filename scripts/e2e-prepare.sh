#!/usr/bin/env bash
# Reset the local database and load the E2E fixture providers. Local databases only.
set -euo pipefail
cd "$(dirname "$0")/.."
export SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
source scripts/local-db-guard.sh
assert_local_db
npm run --silent db:reset
psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -1 -f supabase/tests/fixtures/e2e.sql

# E2E admin user (idempotent: auth.users survives db:reset, profiles does not).
API_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://127.0.0.1:54321}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' .env.example)}"
E2E_ADMIN_EMAIL="admin@example.test"
E2E_ADMIN_PASSWORD="e2e-admin-password"
status=$(curl -sS -o /tmp/e2e-admin-user.json -w '%{http_code}' -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$E2E_ADMIN_EMAIL\",\"password\":\"$E2E_ADMIN_PASSWORD\",\"email_confirm\":true}")
if [ "$status" != "200" ] && [ "$status" != "201" ]; then
  if ! grep -qi "already" /tmp/e2e-admin-user.json; then
    echo "[e2e-prepare] could not create admin user (HTTP $status): $(cat /tmp/e2e-admin-user.json)" >&2
    exit 1
  fi
fi
rm -f /tmp/e2e-admin-user.json
psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "insert into public.profiles (user_id, role) select id, 'admin' from auth.users where email = '$E2E_ADMIN_EMAIL'
   on conflict (user_id) do update set role = 'admin'"
