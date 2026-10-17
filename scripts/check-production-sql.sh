#!/usr/bin/env bash
# Proves docs/launch/plan-2b-production.sql applies in one go to a database in production's state (all migrations
# up to 20261012000017, with production-like rows), then docs/launch/launch-checklist-production.sql,
# docs/launch/review-source-production.sql, docs/launch/availability-production.sql,
# docs/launch/trader-dashboard-production.sql, docs/launch/pro-tier-production.sql,
# docs/launch/community-questions-production.sql and docs/launch/price-guides-production.sql after it (and that each
# later one refuses to run first), each twice, then runs every pgTAP test on the result. Local databases only.
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
SCRIPT6=docs/launch/pro-tier-production.sql
UNTIL6=20261012000029
SCRIPT7=docs/launch/community-questions-production.sql
UNTIL7=20261012000030
SCRIPT8=docs/launch/price-guides-production.sql
UNTIL8=20261012000031
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

# A listing paused before the trader dashboard script: it must count as paused by the admin afterwards. A live one
# must read as a plain listing (no ID checked mark, no photos) after the Pro script.
"${PSQL[@]}" -c "insert into public.providers (slug, business_name, phone_e164, status, consent_at, consent_evidence)
  values ('prod-check-paused', 'Prod Check Paused', '+447700900991', 'paused', now(), '{\"source\":\"check\"}'::jsonb),
         ('prod-check-live', 'Prod Check Live', '+447700900992', 'live', now(), '{\"source\":\"check\"}'::jsonb)"

echo "[check-prod] the Pro script refuses to run before the trader dashboard one"
if "${PSQL[@]}" -f "$SCRIPT6" >/dev/null 2>&1; then echo "[check-prod] $SCRIPT6 ran before $SCRIPT5"; exit 1; fi
"${PSQL[@]}" -A -t -c "select to_regclass('public.subscriptions') is null" | grep -qx t \
  || { echo "[check-prod] the refused Pro script left something behind"; exit 1; }

echo "[check-prod] applying $SCRIPT5"
out="$("${PSQL[@]}" -A -t -f "$SCRIPT5")"
echo "$out" | tail -1
expected5="$(for f in supabase/migrations/*.sql; do b="$(basename "$f")"; v="${b%%_*}"; if [[ "$v" > "$UNTIL5" && ! "$v" > "$UNTIL6" ]]; then echo "$b"; fi; done | wc -l | tr -d ' ')"
echo "$out" | grep -q "^Trader dashboard database changes applied|$expected5\$" || { echo "[check-prod] the closing check did not report $expected5 migrations"; exit 1; }
"${PSQL[@]}" -A -t -c "select paused_by from public.providers where slug = 'prod-check-paused'" | grep -qx admin \
  || { echo "[check-prod] a listing paused before the script is not marked as paused by the admin"; exit 1; }
echo "[check-prod] applying it a second time (a re-run must not fail)"
"${PSQL[@]}" -A -t -f "$SCRIPT5" | tail -1

echo "[check-prod] the community questions script refuses to run before the Pro one"
if "${PSQL[@]}" -f "$SCRIPT7" >/dev/null 2>&1; then echo "[check-prod] $SCRIPT7 ran before $SCRIPT6"; exit 1; fi
"${PSQL[@]}" -A -t -c "select to_regclass('public.questions') is null" | grep -qx t \
  || { echo "[check-prod] the refused community questions script left something behind"; exit 1; }

echo "[check-prod] applying $SCRIPT6"
out="$("${PSQL[@]}" -A -t -f "$SCRIPT6")"
echo "$out" | tail -1
expected6="$(for f in supabase/migrations/*.sql; do b="$(basename "$f")"; v="${b%%_*}"; if [[ "$v" > "$UNTIL6" && ! "$v" > "$UNTIL7" ]]; then echo "$b"; fi; done | wc -l | tr -d ' ')"
echo "$out" | grep -q "^Pro database changes applied|$expected6\$" || { echo "[check-prod] the closing check did not report $expected6 migrations"; exit 1; }
"${PSQL[@]}" -A -t -c "select count(*) from public.provider_public where slug = 'prod-check-live' and not id_checked and photos = '[]'::jsonb" | grep -qx 1 \
  || { echo "[check-prod] a live listing without Pro does not read as a plain listing after the Pro script"; exit 1; }
echo "[check-prod] applying it a second time (a re-run must not fail)"
"${PSQL[@]}" -A -t -f "$SCRIPT6" | tail -1

echo "[check-prod] the price guides script refuses to run before the community questions one"
if "${PSQL[@]}" -f "$SCRIPT8" >/dev/null 2>&1; then echo "[check-prod] $SCRIPT8 ran before $SCRIPT7"; exit 1; fi
"${PSQL[@]}" -A -t -c "select to_regclass('public.price_guide_public') is null" | grep -qx t \
  || { echo "[check-prod] the refused price guides script left something behind"; exit 1; }

echo "[check-prod] applying $SCRIPT7"
out="$("${PSQL[@]}" -A -t -f "$SCRIPT7")"
echo "$out" | tail -1
expected7="$(for f in supabase/migrations/*.sql; do b="$(basename "$f")"; v="${b%%_*}"; if [[ "$v" > "$UNTIL7" && ! "$v" > "$UNTIL8" ]]; then echo "$b"; fi; done | wc -l | tr -d ' ')"
echo "$out" | grep -q "^Community questions database changes applied|$expected7\$" || { echo "[check-prod] the closing check did not report $expected7 migrations"; exit 1; }
"${PSQL[@]}" -A -t -c "select count(*) from public.question_public" | grep -qx 0 \
  || { echo "[check-prod] question_public is not empty and readable after the community questions script"; exit 1; }
echo "[check-prod] applying it a second time (a re-run must not fail)"
"${PSQL[@]}" -A -t -f "$SCRIPT7" | tail -1

echo "[check-prod] applying $SCRIPT8"
out="$("${PSQL[@]}" -A -t -f "$SCRIPT8")"
echo "$out" | tail -1
expected8="$(for f in supabase/migrations/*.sql; do b="$(basename "$f")"; [[ "${b%%_*}" > "$UNTIL8" ]] && echo "$b"; done | wc -l | tr -d ' ')"
echo "$out" | grep -q "^Price guides database changes applied|$expected8\$" || { echo "[check-prod] the closing check did not report $expected8 migrations"; exit 1; }
"${PSQL[@]}" -A -t -c "select count(*) from public.price_guide_public" | grep -qx 0 \
  || { echo "[check-prod] price_guide_public is not empty and readable after the price guides script"; exit 1; }
echo "[check-prod] applying it a second time (a re-run must not fail)"
"${PSQL[@]}" -A -t -f "$SCRIPT8" | tail -1

# The pgTAP tests expect only their own fixtures.
"${PSQL[@]}" -c "delete from public.providers where slug in ('prod-check-travel', 'prod-check-paused', 'prod-check-live');
  delete from public.profiles where user_id = '00000000-0000-0000-0000-0000000fad01';
  delete from auth.users where id = '00000000-0000-0000-0000-0000000fad01';
  update public.settings set value = value - 'prod-check-admin@example.com' where key = 'admin_emails';"

echo "[check-prod] pgTAP on the result"
npm run --silent test:db
echo "[check-prod] OK"
