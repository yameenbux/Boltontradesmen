#!/usr/bin/env bash
# Proves docs/launch/plan-2b-production.sql applies in one go to a database in production's state (all migrations
# up to 20261012000017, with production-like rows), then runs every pgTAP test on the result. Local databases only.
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

echo "[check-prod] applying $SCRIPT"
out="$("${PSQL[@]}" -A -t -f "$SCRIPT")"
echo "$out" | tail -1
echo "$out" | grep -q '^Plan 2b database changes applied|5$' || { echo "[check-prod] the closing check did not report 5 migrations"; exit 1; }

echo "[check-prod] applying it a second time (a re-run must not fail or change the pepper)"
pepper_before="$("${PSQL[@]}" -A -t -c "select encode(value, 'hex') from private.secrets where key = 'identity_pepper'")"
"${PSQL[@]}" -A -t -f "$SCRIPT" | tail -1
pepper_after="$("${PSQL[@]}" -A -t -c "select encode(value, 'hex') from private.secrets where key = 'identity_pepper'")"
[ "$pepper_before" = "$pepper_after" ] || { echo "[check-prod] the pepper changed on a re-run"; exit 1; }

# The pgTAP tests expect only their own fixtures.
"${PSQL[@]}" -c "delete from public.providers where slug = 'prod-check-travel';
  delete from public.profiles where user_id = '00000000-0000-0000-0000-0000000fad01';
  delete from auth.users where id = '00000000-0000-0000-0000-0000000fad01';
  update public.settings set value = value - 'prod-check-admin@example.com' where key = 'admin_emails';"

echo "[check-prod] pgTAP on the result"
npm run --silent test:db
echo "[check-prod] OK"
