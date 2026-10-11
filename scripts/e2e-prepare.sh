#!/usr/bin/env bash
# Reset the local database and load the E2E fixture providers. Local databases only.
set -euo pipefail
cd "$(dirname "$0")/.."
export SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
source scripts/local-db-guard.sh
assert_local_db
npm run --silent db:reset
psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -1 -f supabase/tests/fixtures/e2e.sql
