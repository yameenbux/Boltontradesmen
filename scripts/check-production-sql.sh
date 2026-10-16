#!/usr/bin/env bash
# Proves docs/launch/plan-2b-production.sql applies in one go to a database in production's state (all migrations
# up to 20261012000017, with production-like rows), then docs/launch/launch-checklist-production.sql,
# docs/launch/review-source-production.sql, docs/launch/availability-production.sql and
# docs/launch/trader-dashboard-production.sql after it (and that each later one refuses to run first), each twice, then
# runs every pgTAP test on the result. Local databases only.
#   npm run db:check-prod
# On the local stack (psql reset, postgres is a superuser) and on the Supabase CLI stack (SUPABASE_CLI_STACK=1, as
# in CI, where postgres doesn't own auth.users, as in production).
set -euo pipefail
cd "$(dirname "$0")/.."
export SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
source scripts/local-db-guard.sh
assert_local_db

SCRIPT=docs/launch/plan-2b-production.sql
UNTIL=20261012000017
SCRIPT2=docs/launch/launch-checklist-production.sql
UNTIL2=20261012000025
SCRIPT3=docs/launch/review-source-production.sql
UNTIL3=20261012000026
SCRIPT4=docs/launch/availability-production.sql
UNTIL4=20261012000027
SCRIPT5=docs/launch/trader-dashboard-production.sql
UNTIL5=20261012000028
PSQL=(psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1)

echo "[check-prod] database at $UNTIL"
DB_RESET_UNTIL="$UNTIL" npm run --silent db:reset

# Production's state: the migration register up to $UNTIL (the CLI stack writes it itself; the psql reset doesn't),
# the owner's admin account (profile with no display name), and one consented provider.
"${PSQL[@]}" <<SQL
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name)
select v, n from (values $(for f in supabase/migrations/*.sql; do b="$(basename "$f" .sql)"; v="${b%%_*}"; [[ "$v" > "$UNTIL" ]] && continue; printf "('%s','%s')," "$v" "${b#*_}"; done | sed 's/,$//')) m(v, n)
on conflict do nothing;
delete from supabase_migrations.schema_migrations where version > '$UNTIL';

update public.settings set value = value || '["prod-check-admin@example.com"]'::jsonb
where key = 'admin_emails' and not value ? 'prod-check-admin@example.com';
delete from auth.users where email = 'prod-check-admin@example.com';
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000fad01', 'prod-check-admin@example.com', now());
insert into public.profiles (user_id, role) values ('00000000-0000-0000-0000-0000000fad01', 'admin');
insert into public.providers (slug, business_name, phone_e164, status, consent_at, consent_evidence)
values ('prod-check-travel', 'Prod Check Travel', '+447700900990', 'consented', now(), '{"source":"check"}'::jsonb);
SQL

echo "[check-prod] the launch checklist script refuses to run before the Plan 2b one"
if "${PSQL[@]}" -f "$SCRIPT2" >/dev/null 2>&1; then echo "[check-prod] $SCRIPT2 ran before $SCRIPT"; exit 1; fi
"${PSQL[@]}" -A -t -c "select to_regclass('public.listing_requests') is null" | grep -qx t \
  || { echo "[check-prod] the refused launch checklist script left something behind"; exit 1; }

echo "[check-prod] applying $SCRIPT"
out="$("${PSQL[@]}" -A -t -f "$SCRIPT")"
echo "$out" | tail -1
# Every migration from $UNTIL to $UNTIL2 is in the script (tests/unit/production-sql.test.ts checks the file matches them).
expected="$(for f in supabase/migrations/*.sql; do b="$(basename "$f")"; v="${b%%_*}"; if [[ "$v" > "$UNTIL" && ! "$v" > "$UNTIL2" ]]; then echo "$b"; fi; done | wc -l | tr -d ' ')"
echo "$out" | grep -q "^Plan 2b database changes applied|$expected\$" || { echo "[check-prod] the closing check did not report $expected migrations"; exit 1; }

echo "[check-prod] applying it a second time (a re-run must not fail or change the pepper)"
pepper_before="$("${PSQL[@]}" -A -t -c "select encode(value, 'hex') from private.secrets where key = 'identity_pepper'")"
"${PSQL[@]}" -A -t -f "$SCRIPT" | tail -1
pepper_after="$("${PSQL[@]}" -A -t -c "select encode(value, 'hex') from private.secrets where key = 'identity_pepper'")"
[ "$pepper_before" = "$pepper_after" ] || { echo "[check-prod] the pepper changed on a re-run"; exit 1; }

echo "[check-prod] the review card script refuses to run before the launch checklist one"
if "${PSQL[@]}" -f "$SCRIPT3" >/dev/null 2>&1; then echo "[check-prod] $SCRIPT3 ran before $SCRIPT2"; exit 1; fi
"${PSQL[@]}" -A -t -c "select count(*) = 0 from information_schema.columns where table_schema = 'public' and table_name = 'reviews' and column_name = 'source'" | grep -qx t \
  || { echo "[check-prod] the refused review card script left something behind"; exit 1; }

echo "[check-prod] applying $SCRIPT2"
out="$("${PSQL[@]}" -A -t -f "$SCRIPT2")"
echo "$out" | tail -1
expected2="$(for f in supabase/migrations/*.sql; do b="$(basename "$f")"; v="${b%%_*}"; if [[ "$v" > "$UNTIL2" && ! "$v" > "$UNTIL3" ]]; then echo "$b"; fi; done | wc -l | tr -d ' ')"
echo "$out" | grep -q "^Launch checklist database changes applied|$expected2\$" || { echo "[check-prod] the closing check did not report $expected2 migrations"; exit 1; }
echo "[check-prod] applying it a second time (a re-run must not fail)"
"${PSQL[@]}" -A -t -f "$SCRIPT2" | tail -1

echo "[check-prod] the availability script refuses to run before the review card one"
if "${PSQL[@]}" -f "$SCRIPT4" >/dev/null 2>&1; then echo "[check-prod] $SCRIPT4 ran before $SCRIPT3"; exit 1; fi
"${PSQL[@]}" -A -t -c "select count(*) = 0 from information_schema.columns where table_schema = 'public' and table_name = 'providers' and column_name = 'availability'" | grep -qx t \
  || { echo "[check-prod] the refused availability script left something behind"; exit 1; }

echo "[check-prod] applying $SCRIPT3"
out="$("${PSQL[@]}" -A -t -f "$SCRIPT3")"
echo "$out" | tail -1
expected3="$(for f in supabase/migrations/*.sql; do b="$(basename "$f")"; v="${b%%_*}"; if [[ "$v" > "$UNTIL3" && ! "$v" > "$UNTIL4" ]]; then echo "$b"; fi; done | wc -l | tr -d ' ')"
echo "$out" | grep -q "^Review card database changes applied|$expected3\$" || { echo "[check-prod] the closing check did not report $expected3 migrations"; exit 1; }
echo "[check-prod] applying it a second time (a re-run must not fail)"
"${PSQL[@]}" -A -t -f "$SCRIPT3" | tail -1

echo "[check-prod] the trader dashboard script refuses to run before the availability one"
if "${PSQL[@]}" -f "$SCRIPT5" >/dev/null 2>&1; then echo "[check-prod] $SCRIPT5 ran before $SCRIPT4"; exit 1; fi
"${PSQL[@]}" -A -t -c "select count(*) = 0 from information_schema.columns where table_schema = 'public' and table_name = 'providers' and column_name = 'paused_by'" | grep -qx t \
  || { echo "[check-prod] the refused trader dashboard script left something behind"; exit 1; }

echo "[check-prod] applying $SCRIPT4"
out="$("${PSQL[@]}" -A -t -f "$SCRIPT4")"
echo "$out" | tail -1
expected4="$(for f in supabase/migrations/*.sql; do b="$(basename "$f")"; v="${b%%_*}"; if [[ "$v" > "$UNTIL4" && ! "$v" > "$UNTIL5" ]]; then echo "$b"; fi; done | wc -l | tr -d ' ')"
echo "$out" | grep -q "^Availability database changes applied|$expected4\$" || { echo "[check-prod] the closing check did not report $expected4 migrations"; exit 1; }
echo "[check-prod] applying it a second time (a re-run must not fail)"
"${PSQL[@]}" -A -t -f "$SCRIPT4" | tail -1

# A listing paused before the trader dashboard script: it must count as paused by the admin afterwards.
"${PSQL[@]}" -c "insert into public.providers (slug, business_name, phone_e164, status, consent_at, consent_evidence)
  values ('prod-check-paused', 'Prod Check Paused', '+447700900991', 'paused', now(), '{\"source\":\"check\"}'::jsonb)"

echo "[check-prod] applying $SCRIPT5"
out="$("${PSQL[@]}" -A -t -f "$SCRIPT5")"
echo "$out" | tail -1
expected5="$(for f in supabase/migrations/*.sql; do b="$(basename "$f")"; [[ "${b%%_*}" > "$UNTIL5" ]] && echo "$b"; done | wc -l | tr -d ' ')"
echo "$out" | grep -q "^Trader dashboard database changes applied|$expected5\$" || { echo "[check-prod] the closing check did not report $expected5 migrations"; exit 1; }
"${PSQL[@]}" -A -t -c "select paused_by from public.providers where slug = 'prod-check-paused'" | grep -qx admin \
  || { echo "[check-prod] a listing paused before the script is not marked as paused by the admin"; exit 1; }
echo "[check-prod] applying it a second time (a re-run must not fail)"
"${PSQL[@]}" -A -t -f "$SCRIPT5" | tail -1

# The pgTAP tests expect only their own fixtures.
"${PSQL[@]}" -c "delete from public.providers where slug in ('prod-check-travel', 'prod-check-paused');
  delete from public.profiles where user_id = '00000000-0000-0000-0000-0000000fad01';
  delete from auth.users where id = '00000000-0000-0000-0000-0000000fad01';
  update public.settings set value = value - 'prod-check-admin@example.com' where key = 'admin_emails';"

echo "[check-prod] pgTAP on the result"
npm run --silent test:db
echo "[check-prod] OK"
