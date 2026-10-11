#!/usr/bin/env bash
# Smoke test for the local Supabase-compatible stack (or a real `supabase start`).
# Usage: npm run test:stack
set -uo pipefail

API_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://127.0.0.1:54321}"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU}"

pass=0
fail=0
ok()   { echo "ok   - $1"; pass=$((pass + 1)); }
nok()  { echo "FAIL - $1${2:+ ($2)}"; fail=$((fail + 1)); }
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s)[process.argv[1]];process.stdout.write(v==null?"":String(v))}catch{}})' "$1"; }
sql()  { psql "$DB_URL" -X -A -t -v ON_ERROR_STOP=1 -c "$1" 2>&1; }

# 1. Auth health
code=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON_KEY" "$API_URL/auth/v1/health")
[ "$code" = 200 ] && ok "GET /auth/v1/health -> 200" || nok "GET /auth/v1/health -> 200" "got $code"

# 2. PostgREST root with anon key
code=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" "$API_URL/rest/v1/")
[ "$code" = 200 ] && ok "GET /rest/v1/ (anon) -> 200" || nok "GET /rest/v1/ (anon) -> 200" "got $code"

# 3. Admin user creation with the service key
email="smoke-$(date +%s)-$RANDOM@example.test"
password="smoke-password-123"
body=$(curl -s -w '\n%{http_code}' -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true}")
code=$(tail -n1 <<<"$body"); resp=$(sed '$d' <<<"$body")
user_id=$(json id <<<"$resp")
[ "$code" = 200 ] && [ -n "$user_id" ] && ok "POST /auth/v1/admin/users -> 200" || nok "POST /auth/v1/admin/users -> 200" "got $code: $resp"

# 4. User exists in auth.users
out=$(sql "select count(*) from auth.users where email = '$email'")
[ "$out" = 1 ] && ok "created user present in auth.users" || nok "created user present in auth.users" "$out"

# 5. Password sign-in returns an access token
resp=$(curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"$password\"}")
token=$(json access_token <<<"$resp")
[ -n "$token" ] && ok "password sign-in returns access_token" || nok "password sign-in returns access_token" "$resp"

# 6. The access token is accepted by PostgREST
if [ -n "$token" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON_KEY" -H "Authorization: Bearer $token" "$API_URL/rest/v1/")
  [ "$code" = 200 ] && ok "GET /rest/v1/ (user JWT) -> 200" || nok "GET /rest/v1/ (user JWT) -> 200" "got $code"
else
  nok "GET /rest/v1/ (user JWT) -> 200" "no token"
fi

# 7. auth.uid() exists and reads request.jwt.claims under a role switch
uid=00000000-0000-0000-0000-000000000001
out=$(sql "begin; set local role authenticated; set local request.jwt.claims = '{\"sub\":\"$uid\",\"role\":\"authenticated\"}'; select auth.uid()::text || '|' || auth.role() || '|' || (auth.jwt() ->> 'sub'); rollback;" | grep '|')
[ "$out" = "$uid|authenticated|$uid" ] && ok "auth.uid()/auth.role()/auth.jwt() read request.jwt.claims" || nok "auth.uid()/auth.role()/auth.jwt() read request.jwt.claims" "$out"

out=$(sql "begin; set local role anon; set local request.jwt.claim.sub = '$uid'; select auth.uid(); rollback;" | grep -- '-')
[ "$out" = "$uid" ] && ok "auth.uid() reads request.jwt.claim.sub" || nok "auth.uid() reads request.jwt.claim.sub" "$out"

# 8. pgTAP installed
out=$(sql "select 1 from pg_extension where extname = 'pgtap'")
[ "$out" = 1 ] && ok "pgtap extension installed" || nok "pgtap extension installed" "$out"

# 9. Public signup is rejected
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"signup-$(date +%s)@example.test\",\"password\":\"$password\"}")
case "$code" in
  2*|000) nok "POST /auth/v1/signup is rejected" "got $code" ;;
  *) ok "POST /auth/v1/signup is rejected ($code)" ;;
esac

# Cleanup
if [ -n "${user_id:-}" ]; then
  curl -s -o /dev/null -X DELETE "$API_URL/auth/v1/admin/users/$user_id" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
fi

echo "# pass $pass, fail $fail"
[ "$fail" -eq 0 ]
