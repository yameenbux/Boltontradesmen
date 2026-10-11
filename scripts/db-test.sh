#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
shopt -s nullglob
files=(supabase/tests/*.test.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "No database tests found in supabase/tests/*.test.sql; skipping."
  exit 0
fi
# `supabase start` does not create pgtap (only `supabase test db` does), so ensure it here.
# It lives in the extensions schema, which is on Supabase's default search_path.
psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -c 'create extension if not exists pgtap with schema extensions'
exec pg_prove -d "$SUPABASE_DB_URL" "${files[@]}"
