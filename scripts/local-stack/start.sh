#!/usr/bin/env bash
# Start a local Supabase-compatible stack (Postgres 54322, gateway 54321).
# Idempotent: services that are already running are left alone.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="$HERE/bin"
LOGS="$HERE/logs"
RUN="$HERE/run"
mkdir -p "$BIN" "$LOGS" "$RUN"

PG_VERSION=16
PG_CLUSTER=supa
PG_PORT=54322
PROXY_PORT=54321
POSTGREST_PORT=54330
AUTH_PORT=54331
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
API_URL="http://127.0.0.1:$PROXY_PORT"
DB_URL="postgresql://postgres:postgres@127.0.0.1:$PG_PORT/postgres"

POSTGREST_VERSION=v12.2.3
POSTGREST_URL="https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz"
AUTH_VERSION=v2.177.0
AUTH_URL="https://github.com/supabase/auth/releases/download/$AUTH_VERSION/auth-$AUTH_VERSION-x86.tar.gz"

ANON_KEY="$(node "$HERE/jwt.mjs" anon)"
SERVICE_ROLE_KEY="$(node "$HERE/jwt.mjs" service_role)"

log() { echo "[stack] $*"; }

as_postgres() {
  if [ "$(id -un)" = postgres ]; then bash -c "$1"
  elif [ "$(id -u)" = 0 ]; then su postgres -c "$1"
  else sudo -u postgres bash -c "$1"
  fi
}

as_root() {
  if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi
}

# ---------------------------------------------------------------- binaries
download_binaries() {
  if [ ! -x "$BIN/postgrest" ] || ! "$BIN/postgrest" --version 2>/dev/null | grep -q "${POSTGREST_VERSION#v}"; then
    log "downloading PostgREST $POSTGREST_VERSION"
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/postgrest.tar.xz" "$POSTGREST_URL"
    tar -xJf "$tmp/postgrest.tar.xz" -C "$tmp"
    mv "$tmp/postgrest" "$BIN/postgrest"
    rm -rf "$tmp"
  fi
  if [ ! -x "$BIN/auth" ] || [ "$("$BIN/auth" version 2>/dev/null)" != "$AUTH_VERSION" ]; then
    log "downloading Supabase Auth $AUTH_VERSION"
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/auth.tar.gz" "$AUTH_URL"
    tar -xzf "$tmp/auth.tar.gz" -C "$tmp"
    rm -rf "$BIN/auth-migrations"
    mv "$tmp/auth" "$BIN/auth"
    mv "$tmp/migrations" "$BIN/auth-migrations"
    rm -rf "$tmp"
  fi
}

# ---------------------------------------------------------------- postgres
start_postgres() {
  if ! pg_lsclusters -h 2>/dev/null | awk '{print $1" "$2}' | grep -qx "$PG_VERSION $PG_CLUSTER"; then
    log "creating Postgres cluster $PG_VERSION/$PG_CLUSTER on port $PG_PORT"
    as_root pg_createcluster "$PG_VERSION" "$PG_CLUSTER" -p "$PG_PORT" >/dev/null
  fi
  if ! pg_lsclusters -h | awk -v v="$PG_VERSION" -v c="$PG_CLUSTER" '$1==v && $2==c {print $4}' | grep -q online; then
    log "starting Postgres cluster $PG_VERSION/$PG_CLUSTER"
    as_root pg_ctlcluster "$PG_VERSION" "$PG_CLUSTER" start
  fi
  for _ in $(seq 1 30); do
    pg_isready -q -h 127.0.0.1 -p "$PG_PORT" && break
    sleep 1
  done
  # Password auth over TCP for the postgres superuser (local socket uses peer auth).
  as_postgres "psql -X -q -p $PG_PORT -c \"alter role postgres with password 'postgres'\""
  log "applying shim.sql"
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$HERE/shim.sql"
}

# Phone test numbers (GOTRUE_SMS_TEST_OTP below: code 123456, no SMS sent) must match [auth.sms.test_otp] in supabase/config.toml.
# Dummy Twilio provider: Auth builds the SMS provider before it checks for a test OTP. Never a real secret.
TWILIO_DUMMY_SID=AC00000000000000000000000000000000
TWILIO_DUMMY_MESSAGE_SERVICE_SID=MG00000000000000000000000000000000
TWILIO_DUMMY_TOKEN=local-dummy-not-a-secret

# ---------------------------------------------------------------- services
is_running() {
  local pidfile="$RUN/$1.pid"
  [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

launch() {
  local name="$1"; shift
  if is_running "$name"; then
    log "$name already running (pid $(cat "$RUN/$name.pid"))"
    return
  fi
  log "starting $name"
  setsid nohup "$@" >>"$LOGS/$name.log" 2>&1 </dev/null &
  echo $! >"$RUN/$name.pid"
}

wait_for() {
  local name="$1" url="$2"
  for _ in $(seq 1 60); do
    if curl -fs -o /dev/null -H "apikey: $ANON_KEY" "$url"; then
      log "$name ready ($url)"
      return 0
    fi
    if ! is_running "$name"; then
      log "$name exited; last log lines:"; tail -n 30 "$LOGS/$name.log" >&2 || true
      return 1
    fi
    sleep 0.5
  done
  log "timed out waiting for $name ($url); see $LOGS/$name.log" >&2
  return 1
}

start_auth() {
  launch auth env \
    PORT="$AUTH_PORT" \
    GOTRUE_API_HOST=127.0.0.1 \
    GOTRUE_API_PORT="$AUTH_PORT" \
    API_EXTERNAL_URL="$API_URL/auth/v1" \
    GOTRUE_DB_DRIVER=postgres \
    GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:$PG_PORT/postgres?search_path=auth" \
    GOTRUE_DB_NAMESPACE=auth \
    GOTRUE_DB_MIGRATIONS_PATH="$BIN/auth-migrations" \
    GOTRUE_SITE_URL=http://localhost:3000 \
    GOTRUE_URI_ALLOW_LIST="http://localhost:3000/**,http://127.0.0.1:3000/**" \
    GOTRUE_DISABLE_SIGNUP=false \
    GOTRUE_JWT_SECRET="$JWT_SECRET" \
    GOTRUE_JWT_EXP=3600 \
    GOTRUE_JWT_AUD=authenticated \
    GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
    GOTRUE_JWT_ADMIN_ROLES=service_role \
    GOTRUE_JWT_ISSUER="$API_URL/auth/v1" \
    GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
    GOTRUE_MAILER_AUTOCONFIRM=true \
    GOTRUE_EXTERNAL_PHONE_ENABLED=true \
    GOTRUE_SMS_AUTOCONFIRM=true \
    GOTRUE_SMS_PROVIDER=twilio \
    GOTRUE_SMS_TWILIO_ACCOUNT_SID="$TWILIO_DUMMY_SID" \
    GOTRUE_SMS_TWILIO_AUTH_TOKEN="$TWILIO_DUMMY_TOKEN" \
    GOTRUE_SMS_TWILIO_MESSAGE_SERVICE_SID="$TWILIO_DUMMY_MESSAGE_SERVICE_SID" \
    GOTRUE_SMS_TEST_OTP="447700900301:123456,447700900401:123456,447700900402:123456,447700900403:123456,447700900404:123456,447700900405:123456,447700900406:123456,447700900407:123456,447700900408:123456,447700900409:123456" \
    GOTRUE_SMS_MAX_FREQUENCY=5s \
    GOTRUE_RATE_LIMIT_SMS_SENT=1000 \
    GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false \
    GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
    GOTRUE_LOG_LEVEL=info \
    "$BIN/auth"
  wait_for auth "http://127.0.0.1:$AUTH_PORT/health"
}

start_postgrest() {
  cat >"$RUN/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:postgres@127.0.0.1:$PG_PORT/postgres"
db-schemas = "public"
db-extra-search-path = "public, extensions"
db-anon-role = "anon"
db-max-rows = 1000
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $POSTGREST_PORT
CONF
  launch postgrest "$BIN/postgrest" "$RUN/postgrest.conf"
  wait_for postgrest "http://127.0.0.1:$POSTGREST_PORT/"
}

start_proxy() {
  launch proxy env PROXY_PORT="$PROXY_PORT" POSTGREST_PORT="$POSTGREST_PORT" AUTH_PORT="$AUTH_PORT" \
    node "$HERE/proxy.mjs"
  wait_for proxy "$API_URL/auth/v1/health"
  wait_for proxy "$API_URL/rest/v1/"
}

verify_auth_functions() {
  local missing
  missing="$(psql "$DB_URL" -X -A -t -c "
    select string_agg(f, ', ') from unnest(array['uid','role','jwt']) f
    where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'auth' and p.proname = f)")"
  if [ -n "$missing" ]; then
    log "ERROR: auth functions missing after Auth migrations: $missing" >&2
    exit 1
  fi
}

download_binaries
start_postgres
start_auth
verify_auth_functions
start_postgrest
start_proxy

cat <<INFO

Local Supabase-compatible stack is running.
         API URL: $API_URL
          DB URL: $DB_URL
      JWT secret: $JWT_SECRET
        anon key: $ANON_KEY
service_role key: $SERVICE_ROLE_KEY
            logs: $LOGS
INFO
