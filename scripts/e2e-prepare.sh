#!/usr/bin/env bash
# Reset the local database and load the E2E fixture providers. Local databases only.
# db:reset uses `supabase db reset` when SUPABASE_CLI_STACK=1 (CI), else the local-stack psql reset.
set -euo pipefail
cd "$(dirname "$0")/.."
export SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
source scripts/local-db-guard.sh
assert_local_db
npm run --silent db:reset
psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -1 -f supabase/tests/fixtures/e2e.sql

# E2E admin user (idempotent: on the local stack auth.users survives db:reset, profiles does not;
# `supabase db reset` wipes both). Retries while auth restarts after a CLI reset.
API_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://127.0.0.1:54321}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' .env.example)}"
E2E_ADMIN_PASSWORD="e2e-admin-password"
# The admin's authenticator (two-step sign-in, e2e/helpers/admin.ts makes the codes). A test-only key.
E2E_ADMIN_TOTP_SECRET="JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
resp="$(mktemp)"; trap 'rm -f "$resp"' EXIT
# admin@ and code-admin@ have an authenticator already (code-admin@ only for the test of the code step, so other tests
# signing in as admin@ can't end its half-finished sign-in); setup-admin@ has none, for the test of setting one up.
for E2E_ADMIN_EMAIL in admin@example.test code-admin@example.test setup-admin@example.test; do
  # The auth.users guard refuses email-only accounts unless the email is allow-listed (settings.admin_emails).
  psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
    "update public.settings set value = value || '[\"$E2E_ADMIN_EMAIL\"]'::jsonb
     where key = 'admin_emails' and not value ? '$E2E_ADMIN_EMAIL'"
  for _ in $(seq 1 30); do
    status=$(curl -sS -o "$resp" -w '%{http_code}' -X POST "$API_URL/auth/v1/admin/users" \
      -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" \
      -d "{\"email\":\"$E2E_ADMIN_EMAIL\",\"password\":\"$E2E_ADMIN_PASSWORD\",\"email_confirm\":true}" 2>/dev/null) || status=000
    case "$status" in 000|502|503|504) sleep 2 ;; *) break ;; esac
  done
  if [ "$status" != "200" ] && [ "$status" != "201" ]; then
    if ! grep -qi "already" "$resp"; then
      echo "[e2e-prepare] could not create admin user $E2E_ADMIN_EMAIL (HTTP $status): $(cat "$resp")" >&2
      exit 1
    fi
  fi
  psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
    "insert into public.profiles (user_id, role) select id, 'admin' from auth.users where email = '$E2E_ADMIN_EMAIL'
     on conflict (user_id) do update set role = 'admin'"
done
psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "delete from auth.mfa_factors where user_id in (select id from auth.users
     where email in ('admin@example.test', 'code-admin@example.test', 'setup-admin@example.test'));
   insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
   select gen_random_uuid(), id, 'e2e', 'totp', 'verified', now(), now(), '$E2E_ADMIN_TOTP_SECRET'
   from auth.users where email in ('admin@example.test', 'code-admin@example.test')"
