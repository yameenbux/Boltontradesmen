#!/usr/bin/env node
// Builds the one-paste production script for a range of migrations (Plan 2b Task 12):
//
//   node scripts/build-production-sql.mjs --from 20261012000018 --to 20261012000025 --out docs/launch/plan-2b-production.sql
//   node scripts/build-production-sql.mjs --preset launch-checklist --from 20261012000026 --to 20261012000026 \
//     --out docs/launch/launch-checklist-production.sql
//   node scripts/build-production-sql.mjs --preset review-source --from 20261012000027 --to <newest> \
//     --out docs/launch/review-source-production.sql
//
// --preset (default plan-2b) picks the header wording, the migration that must already be recorded (checked first,
// so pasting the scripts in the wrong order changes nothing) and the verification block.
// The output is one transaction: begin; each migration under a "-- ==== <filename>" banner followed by its
// supabase_migrations.schema_migrations row; a verification block that raises (rolling everything back) if a piece
// is missing; commit; then a select that says it worked. Deterministic: same migrations, same file.
// scripts/check-production-sql.sh applies it to a database at the --from minus one state and runs the pgTAP tests.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : fallback;
  if (!v) {
    console.error(`usage: build-production-sql.mjs --from <version> --to <version> --out <file> (missing --${name})`);
    process.exit(2);
  }
  return v;
}

const from = arg("from");
const to = arg("to");
const out = path.resolve(root, arg("out"));

const dir = path.join(root, "supabase/migrations");
const files = readdirSync(dir)
  .filter((f) => /^\d{14}_.+\.sql$/.test(f))
  .sort()
  .filter((f) => f.slice(0, 14) >= from && f.slice(0, 14) <= to);
if (files.length === 0) {
  console.error(`no migrations between ${from} and ${to}`);
  process.exit(1);
}

const sqlString = (s) => `'${s.replace(/'/g, "''")}'`;

// Checks that fail the whole paste if something didn't land. Runs inside the transaction, before commit.
const VERIFY_2B = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
declare
  f text;
  t text;
begin
  foreach f in array array['email_gate', 'email_verify_gate', 'claim_trader_link', 'admin_list_reviews_pending', 'tidy_sign_in_records'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = f) then
      raise exception 'Plan 2b check failed: function public.% is missing', f;
    end if;
  end loop;
  -- pg_enum, not enum_range(): a value added in this transaction can't be used until it commits.
  if not exists (select 1 from pg_enum e join pg_type ty on ty.oid = e.enumtypid join pg_namespace n on n.oid = ty.typnamespace
                 where n.nspname = 'public' and ty.typname = 'review_status' and e.enumlabel = 'pending') then
    raise exception 'Plan 2b check failed: review status pending is missing';
  end if;
  if (select count(*) from public.blocked_email_domains) <= 1000 then
    raise exception 'Plan 2b check failed: the throwaway email domain list is not loaded';
  end if;
  if not exists (select 1 from private.secrets where key = 'identity_pepper') then
    raise exception 'Plan 2b check failed: the identity pepper is missing';
  end if;
  foreach t in array array['bv_guard_auth_user_insert', 'bv_guard_auth_user_phone', 'bv_scrub_auth_user'] loop
    if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = t and not tgisinternal) then
      raise exception 'Plan 2b check failed: trigger % is no longer on auth.users', t;
    end if;
  end loop;
end
$verify$;
`;

// Launch checklist (migration 000026 onwards): "Get listed" requests.
const VERIFY_LAUNCH = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
declare
  f text;
begin
  foreach f in array array['submit_listing_request', 'admin_list_listing_requests', 'admin_set_listing_request_status'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = f) then
      raise exception 'Launch checklist check failed: function public.% is missing', f;
    end if;
  end loop;
  if position('tidy_listing_requests' in pg_get_functiondef('private.tidy_sign_in_records()'::regprocedure)) = 0 then
    raise exception 'Launch checklist check failed: the sign-in tidy does not delete old listing requests';
  end if;
  if position('listing_requests' in pg_get_functiondef('public.admin_counts()'::regprocedure)) = 0 then
    raise exception 'Launch checklist check failed: admin_counts does not count listing requests';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.listing_requests'::regclass) then
    raise exception 'Launch checklist check failed: row level security is off on public.listing_requests';
  end if;
  if has_table_privilege('anon', 'public.listing_requests', 'select')
     or has_table_privilege('authenticated', 'public.listing_requests', 'select')
     or has_function_privilege('anon', 'public.submit_listing_request(text, text, text, text, text, text, text, text)', 'execute') then
    raise exception 'Launch checklist check failed: listing requests are reachable without the server';
  end if;
end
$verify$;
`;

// Review request cards (migration 000027 onwards): reviews.source.
const VERIFY_REVIEW_SOURCE = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'reviews' and column_name = 'source') then
    raise exception 'Review source check failed: column public.reviews.source is missing';
  end if;
  if position('source' in pg_get_functiondef('public.submit_review(uuid, jsonb, text)'::regprocedure)) = 0 then
    raise exception 'Review source check failed: submit_review does not record the source';
  end if;
  if position('source' in pg_get_functiondef('private.admin_review_json(uuid)'::regprocedure)) = 0 then
    raise exception 'Review source check failed: the admin review view does not show the source';
  end if;
  if has_function_privilege('anon', 'public.submit_review(uuid, jsonb, text)', 'execute')
     or has_function_privilege('authenticated', 'public.submit_review(uuid, jsonb, text)', 'execute')
     or not has_function_privilege('service_role', 'public.submit_review(uuid, jsonb, text)', 'execute') then
    raise exception 'Review source check failed: submit_review is no longer service role only';
  end if;
end
$verify$;
`;

const PRESETS = {
  "plan-2b": {
    title: "Plan 2b database changes (free sign-in: Google and email codes)",
    done: "Plan 2b database changes applied",
    requires: null,
    verify: VERIFY_2B,
  },
  "launch-checklist": {
    title: "launch checklist database changes (Get listed requests)",
    done: "Launch checklist database changes applied",
    // It re-creates private.tidy_sign_in_records, which needs Plan 2b's pieces.
    requires: { version: "20261012000025", what: "the Plan 2b script (docs/launch/plan-2b-production.sql)" },
    verify: VERIFY_LAUNCH,
  },
  "review-source": {
    title: "review card database changes (where a review came from)",
    done: "Review card database changes applied",
    requires: { version: "20261012000026", what: "the launch checklist script (docs/launch/launch-checklist-production.sql)" },
    verify: VERIFY_REVIEW_SOURCE,
  },
};
const preset = PRESETS[arg("preset", "plan-2b")];
if (!preset) {
  console.error(`unknown --preset; use one of: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(2);
}

const versions = files.map((f) => sqlString(f.slice(0, 14))).join(", ");

const parts = [
  `-- Bolton Vouched: ${preset.title} for the LIVE Supabase project
-- (mmarznvndvbwyhhtbfjy).
-- Paste ALL of this into Supabase -> SQL Editor -> New query -> Run, once. It is one transaction: if anything
-- fails, nothing is changed. Confirm the 'destructive operation' warning (it comes from 'create or replace' and
-- 'drop ... if exists' lines; no data is deleted). The checks at the end fail the whole paste if a piece is missing.
-- Generated by scripts/build-production-sql.mjs from supabase/migrations/${files[0]} .. ${files[files.length - 1]};
-- do not edit by hand.
begin;
`,
];

if (preset.requires) {
  const { version, what } = preset.requires;
  parts.push(`-- Run ${what} first: this stops (changing nothing) if it hasn't been.
do $requires$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = ${sqlString(version)}) then
    raise exception ${sqlString(`Run ${what} first: migration ${version} is not recorded`)};
  end if;
end
$requires$;
`);
}

for (const f of files) {
  const body = readFileSync(path.join(dir, f), "utf8").replace(/\s+$/, "");
  const version = f.slice(0, 14);
  const name = f.slice(15, -4);
  parts.push(`-- ==== ${f}
${body}

insert into supabase_migrations.schema_migrations (version, name) values (${sqlString(version)}, ${sqlString(name)}) on conflict do nothing;
`);
}

parts.push(preset.verify);
parts.push(`commit;

select ${sqlString(preset.done)} as result,
       (select count(*) from supabase_migrations.schema_migrations where version in (${versions})) as migrations_recorded;
`);

writeFileSync(out, parts.join("\n"));
console.log(`wrote ${path.relative(root, out)} (${files.length} migrations: ${files[0]} .. ${files[files.length - 1]})`);
