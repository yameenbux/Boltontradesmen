#!/usr/bin/env bash
# Smoke test for the local Supabase-compatible stack (or a real `supabase start`).
# Usage: npm run test:stack
set -uo pipefail

API_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://127.0.0.1:54321}"
# Local inbox: Mailpit's API (real `supabase start`) or scripts/local-stack/mail-sink.mjs (same subset).
INBOX_URL="${INBOX_URL:-http://127.0.0.1:54324}"
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

# Phone sign-up is gated by the database (otp_requests approvals; admin emails allow-listed).
APPROVED_PHONE=447700900409
UNAPPROVED_PHONE=447700900408
SMOKE_EMAIL=smoke@residents.example.test
SMOKE_PW_EMAIL=pw@residents.example.test
smoke_cleanup() {
  sql "delete from auth.users where phone in ('$APPROVED_PHONE', '$UNAPPROVED_PHONE');
       delete from public.otp_requests where ip_hash = 'smoke';
       delete from auth.users where email in ('$SMOKE_EMAIL', '$SMOKE_PW_EMAIL');
       delete from public.email_requests where ip_hash = 'smoke';
       update public.settings set value = coalesce((select jsonb_agg(e) from jsonb_array_elements(value) e
         where e #>> '{}' not like 'smoke-%@example.test'), '[]'::jsonb) where key = 'admin_emails';" >/dev/null
}
smoke_cleanup

# 3. Admin user creation with the service key (the email must be on the admin allow-list)
email="smoke-$(date +%s)-$RANDOM@example.test"
password="smoke-password-123"
sql "update public.settings set value = value || '[\"$email\"]'::jsonb where key = 'admin_emails'" >/dev/null
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

# The app's sign-in action approves a request bound to a single-use nonce (only its sha256 is stored) and
# passes the nonce to GoTrue in the sign-up metadata; the auth.users guard checks and consumes it.
approve_with_nonce() {  # $1 phone without +, $2 nonce
  sql "insert into public.otp_requests (phone_e164, ip_hash, outcome, nonce_hash)
       values ('+$1', 'smoke', 'approved', encode(sha256(convert_to('$2', 'UTF8')), 'hex'))" >/dev/null
}
NONCE_409="smoke-nonce-409-$RANDOM$RANDOM"

# 10. Phone OTP: the app's flow (approved request + its nonce) gets a code (no SMS) and signs in with 123456
approve_with_nonce "$APPROVED_PHONE" "$NONCE_409"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/v1/otp" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"+$APPROVED_PHONE\",\"create_user\":true,\"data\":{\"bv_nonce\":\"$NONCE_409\"}}")
[ "$code" = 200 ] && ok "POST /auth/v1/otp (app flow: approved number + nonce) -> 200" || nok "POST /auth/v1/otp (app flow: approved number + nonce) -> 200" "got $code"
resp=$(curl -s -X POST "$API_URL/auth/v1/verify" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"type\":\"sms\",\"phone\":\"+$APPROVED_PHONE\",\"token\":\"123456\"}")
phone_token=$(json access_token <<<"$resp")
[ -n "$phone_token" ] && ok "POST /auth/v1/verify (test OTP 123456) returns access_token" || nok "POST /auth/v1/verify (test OTP 123456) returns access_token" "$resp"
out=$(sql "select (raw_user_meta_data ? 'bv_nonce')::text || '|' || (select (consumed_at is not null)::text from public.otp_requests
           where ip_hash = 'smoke' and phone_e164 = '+$APPROVED_PHONE') from auth.users where phone = '$APPROVED_PHONE'")
[ "$out" = "false|true" ] && ok "the nonce is consumed and stripped from the account" || nok "the nonce is consumed and stripped from the account" "$out"

# 11. Phone OTP for a number the app's gate did not approve is refused, and no account is created
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/v1/otp" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d "{\"phone\":\"+$UNAPPROVED_PHONE\"}")
case "$code" in
  2*|000) nok "POST /auth/v1/otp (unapproved number) is rejected" "got $code" ;;
  *) ok "POST /auth/v1/otp (unapproved number) is rejected ($code)" ;;
esac
out=$(sql "select count(*) from auth.users where phone = '$UNAPPROVED_PHONE'")
[ "$out" = 0 ] && ok "no auth.users row for the unapproved number" || nok "no auth.users row for the unapproved number" "$out"

# 12. Email sign-up for an address that is not on the admin allow-list is refused
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.test","password":"xxxxxxxx"}')
case "$code" in
  2*|000) nok "POST /auth/v1/signup (nobody@example.test) is rejected" "got $code" ;;
  *) ok "POST /auth/v1/signup (nobody@example.test) is rejected ($code)" ;;
esac

# 13. C1: an approved number without the app's nonce cannot be signed up with a password (the /signup race)
sql "insert into public.otp_requests (phone_e164, ip_hash, outcome) values ('+$UNAPPROVED_PHONE', 'smoke', 'approved')" >/dev/null
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"+$UNAPPROVED_PHONE\",\"password\":\"attacker-pass-123\"}")
case "$code" in
  2*|000) nok "POST /auth/v1/signup (phone + password, no app nonce) is rejected" "got $code" ;;
  *) ok "POST /auth/v1/signup (phone + password, no app nonce) is rejected ($code)" ;;
esac
out=$(sql "select count(*) from auth.users where phone = '$UNAPPROVED_PHONE'")
[ "$out" = 0 ] && ok "no account for the password sign-up" || nok "no account for the password sign-up" "$out"

# 14. C1: even a password sign-up carrying a valid nonce never gets a working password
NONCE_408="smoke-nonce-408-$RANDOM$RANDOM"
approve_with_nonce "$UNAPPROVED_PHONE" "$NONCE_408"
resp=$(curl -s -w '\n%{http_code}' -X POST "$API_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"+$UNAPPROVED_PHONE\",\"password\":\"attacker-pass-123\",\"data\":{\"bv_nonce\":\"$NONCE_408\"}}")
code=$(tail -n1 <<<"$resp")
[ -z "$(json access_token <<<"$(sed '$d' <<<"$resp")")" ] && ok "password sign-up with a nonce gets no session (confirmation required) ($code)" \
  || nok "password sign-up with a nonce gets no session (confirmation required)" "$resp"
password_grant() {
  curl -s -X POST "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
    -d "{\"phone\":\"+$UNAPPROVED_PHONE\",\"password\":\"attacker-pass-123\"}"
}
[ -z "$(json access_token <<<"$(password_grant)")" ] && ok "the planted password does not sign in before confirmation" \
  || nok "the planted password does not sign in before confirmation"
sleep 5  # GOTRUE_SMS_MAX_FREQUENCY
# the real owner later signs in through the app (no new account, so no nonce needed) and enters the code
curl -s -o /dev/null -X POST "$API_URL/auth/v1/otp" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"+$UNAPPROVED_PHONE\"}"
resp=$(curl -s -X POST "$API_URL/auth/v1/verify" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"type\":\"sms\",\"phone\":\"+$UNAPPROVED_PHONE\",\"token\":\"123456\"}")
[ -n "$(json access_token <<<"$resp")" ] && ok "the owner confirms the number with their code" || nok "the owner confirms the number with their code" "$resp"
resp=$(password_grant)
[ -z "$(json access_token <<<"$resp")" ] && ok "the planted password still does not sign in after confirmation (no takeover)" \
  || nok "the planted password still does not sign in after confirmation (no takeover)" "$resp"

# 15. C1: a nonce works once. Delete the account and replay the same nonce: refused, no account.
sql "delete from auth.users where phone = '$APPROVED_PHONE'" >/dev/null
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/v1/otp" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"+$APPROVED_PHONE\",\"create_user\":true,\"data\":{\"bv_nonce\":\"$NONCE_409\"}}")
case "$code" in
  2*|000) nok "POST /auth/v1/otp replaying a used nonce is rejected" "got $code" ;;
  *) ok "POST /auth/v1/otp replaying a used nonce is rejected ($code)" ;;
esac
out=$(sql "select count(*) from auth.users where phone = '$APPROVED_PHONE'")
[ "$out" = 0 ] && ok "no account from the replayed nonce" || nok "no account from the replayed nonce" "$out"

# 16. Email code sign-in (Plan 2b). Without the app's nonce GoTrue cannot create the account.
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/v1/otp" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"create_user\":true}")
[ "$code" != 200 ] && ok "POST /auth/v1/otp (email, no nonce) is rejected ($code)" || nok "POST /auth/v1/otp (email, no nonce) is rejected" "got $code"
out=$(sql "select count(*) from auth.users where email = '$SMOKE_EMAIL'")
[ "$out" = 0 ] && ok "no auth.users row for the email without a nonce" || nok "no auth.users row for the email without a nonce" "$out"

# 17. The app's flow: an approved email_requests row bound to the nonce → 200, a code arrives, verify signs in.
SMOKE_NONCE="smoke-nonce-$RANDOM$RANDOM"
sql "insert into public.email_requests (email_norm, ip_hash, outcome, nonce_hash)
     values ('$SMOKE_EMAIL', 'smoke', 'approved', encode(sha256(convert_to('$SMOKE_NONCE', 'UTF8')), 'hex'))" >/dev/null
sent_after=$(node -e 'process.stdout.write(new Date(Date.now() - 1000).toISOString())')
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/v1/otp" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"create_user\":true,\"data\":{\"bv_nonce\":\"$SMOKE_NONCE\"}}")
[ "$code" = 200 ] && ok "POST /auth/v1/otp (email, app flow with nonce) -> 200" || nok "POST /auth/v1/otp (email, app flow with nonce) -> 200" "got $code"
email_code=""
message_id=""
for _ in $(seq 1 40); do
  message_id=$(curl -s "$INBOX_URL/api/v1/search?query=$(node -e 'process.stdout.write(encodeURIComponent(`to:"${process.argv[1]}"`))' "$SMOKE_EMAIL")" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const m=(JSON.parse(s).messages||[]).find(x=>new Date(x.Created)>new Date(process.argv[1]));process.stdout.write(m?m.ID:"")}catch{}})' "$sent_after")
  [ -n "$message_id" ] && break
  sleep 0.25
done
if [ -n "$message_id" ]; then
  msg=$(curl -s "$INBOX_URL/api/v1/message/$message_id")
  email_code=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s);const c=/\b\d{6}\b/.exec(m.Text||"");process.stdout.write((c?c[0]:"")+"|"+m.Subject)})' <<<"$msg")
fi
[ -n "${email_code%%|*}" ] && [ "${email_code#*|}" = "Your Bolton Vouched sign-in code" ] \
  && ok "the sign-in code email reaches the inbox within 10 s" || nok "the sign-in code email reaches the inbox within 10 s" "id=$message_id $email_code"
email_code="${email_code%%|*}"
resp=$(curl -s -X POST "$API_URL/auth/v1/verify" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"type\":\"email\",\"email\":\"$SMOKE_EMAIL\",\"token\":\"$email_code\"}")
[ -n "$(json access_token <<<"$resp")" ] && ok "POST /auth/v1/verify (type email) returns access_token" || nok "POST /auth/v1/verify (type email) returns access_token" "$resp"
if [ -n "$message_id" ]; then
  curl -s -o /dev/null -X DELETE "$INBOX_URL/api/v1/messages" -H 'Content-Type: application/json' -d "{\"IDs\":[\"$message_id\"]}"
fi

# 18. An email + password sign-up is refused
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_PW_EMAIL\",\"password\":\"xxxxxxxx\"}")
[ "$code" != 200 ] && ok "POST /auth/v1/signup ($SMOKE_PW_EMAIL + password) is rejected ($code)" || nok "POST /auth/v1/signup ($SMOKE_PW_EMAIL + password) is rejected" "got $code"

# 19. Continue with Google starts at Google with the local dummy client
location=$(curl -s -o /dev/null -w '%{redirect_url}' -H "apikey: $ANON_KEY" "$API_URL/auth/v1/authorize?provider=google")
code=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON_KEY" "$API_URL/auth/v1/authorize?provider=google")
case "$location" in
  https://accounts.google.com/*client_id=local-dummy*) [ "$code" = 302 ] && ok "GET /auth/v1/authorize?provider=google -> 302 to Google (dummy client)" \
      || nok "GET /auth/v1/authorize?provider=google -> 302" "got $code" ;;
  *) nok "GET /auth/v1/authorize?provider=google -> 302 to Google (dummy client)" "got $code $location" ;;
esac

# Cleanup
smoke_cleanup
if [ -n "${user_id:-}" ]; then
  curl -s -o /dev/null -X DELETE "$API_URL/auth/v1/admin/users/$user_id" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
fi

echo "# pass $pass, fail $fail"
[ "$fail" -eq 0 ]
