#!/usr/bin/env bash
# Hermetic test: db-reset.sh must refuse non-local databases without running psql.
# A fake psql on PATH records any invocation; no real database is contacted.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat >"$tmp/bin/psql" <<FAKE
#!/usr/bin/env bash
echo called >>"$tmp/psql.calls"
cat >/dev/null 2>&1 || true
exit 0
FAKE
chmod +x "$tmp/bin/psql"

pass=0; fail=0
ok()  { echo "ok   - $1"; pass=$((pass + 1)); }
nok() { echo "FAIL - $1${2:+ ($2)}"; fail=$((fail + 1)); }
run() { rm -f "$tmp/psql.calls"; out=$(env -u ALLOW_NONLOCAL_DB_RESET PATH="$tmp/bin:$PATH" "$@" bash "$ROOT/scripts/db-reset.sh" </dev/null 2>&1); code=$?; calls=$( [ -f "$tmp/psql.calls" ] && wc -l <"$tmp/psql.calls" || echo 0); }

for url in \
  "postgresql://postgres:postgres@db.example.com:5432/postgres" \
  "postgresql://postgres:secret@10.0.0.5:6543/postgres" \
  "postgres://u:p@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require" \
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=db.example.com" \
  "not a url"; do
  run SUPABASE_DB_URL="$url"
  if [ "$code" -ne 0 ] && [ "$calls" -eq 0 ] && grep -q "refusing" <<<"$out"; then
    ok "refuses '$url' without running psql (exit $code)"
  else
    nok "refuses '$url' without running psql" "exit=$code psql_calls=$calls out=$out"
  fi
done

for url in \
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  "postgresql://postgres:postgres@localhost:54322/postgres" \
  "postgresql://postgres:postgres@[::1]:54322/postgres"; do
  run SUPABASE_DB_URL="$url"
  [ "$code" -eq 0 ] && [ "$calls" -gt 0 ] && ok "allows local '$url'" || nok "allows local '$url'" "exit=$code psql_calls=$calls out=$out"
done

run SUPABASE_DB_URL="postgresql://postgres:postgres@db.example.com:5432/postgres" ALLOW_NONLOCAL_DB_RESET=1
[ "$code" -eq 0 ] && [ "$calls" -gt 0 ] && ok "ALLOW_NONLOCAL_DB_RESET=1 overrides the guard" || nok "ALLOW_NONLOCAL_DB_RESET=1 overrides the guard" "exit=$code psql_calls=$calls out=$out"

echo "# pass $pass, fail $fail"
[ "$fail" -eq 0 ]
