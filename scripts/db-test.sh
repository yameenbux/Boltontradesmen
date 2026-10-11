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
exec pg_prove -d "$SUPABASE_DB_URL" "${files[@]}"
