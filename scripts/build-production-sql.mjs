#!/usr/bin/env node
// Builds the one-paste production script for a range of migrations (Plan 2b Task 12):
//
//   node scripts/build-production-sql.mjs --from 20261012000018 --to 20261012000025 --out docs/launch/plan-2b-production.sql
//   node scripts/build-production-sql.mjs --preset launch-checklist --from 20261012000026 --to 20261012000026 \
//     --out docs/launch/launch-checklist-production.sql
//   node scripts/build-production-sql.mjs --preset review-source --from 20261012000027 --to 20261012000027 \
//     --out docs/launch/review-source-production.sql
//   node scripts/build-production-sql.mjs --preset availability --from 20261012000028 --to 20261012000028 \
//     --out docs/launch/availability-production.sql
//   node scripts/build-production-sql.mjs --preset trader-dashboard --from 20261012000029 --to 20261012000029 \
//     --out docs/launch/trader-dashboard-production.sql
//   node scripts/build-production-sql.mjs --preset pro-tier --from 20261012000030 --to 20261012000030 \
//     --out docs/launch/pro-tier-production.sql
//   node scripts/build-production-sql.mjs --preset community-questions --from 20261012000031 --to 20261012000031 \
//     --out docs/launch/community-questions-production.sql
//   node scripts/build-production-sql.mjs --preset price-guides --from 20261012000032 --to 20261012000032 \
//     --out docs/launch/price-guides-production.sql
//   node scripts/build-production-sql.mjs --preset consent-link --from 20261012000033 --to 20261012000033 \
//     --out docs/launch/consent-link-production.sql
//   node scripts/build-production-sql.mjs --preset one-listing --from 20261012000034 --to 20261012000034 \
//     --out docs/launch/one-listing-production.sql
//   node scripts/build-production-sql.mjs --preset pro-jobs --from 20261012000035 --to 20261012000035 \
//     --out docs/launch/pro-jobs-production.sql
//   node scripts/build-production-sql.mjs --preset quotes-invoices --from 20261012000036 --to 20261012000036 \
//     --out docs/launch/quotes-invoices-production.sql
//   node scripts/build-production-sql.mjs --preset trader-sign-up --from 20261012000037 --to 20261012000037 \
//     --out docs/launch/trader-sign-up-production.sql
//   node scripts/build-production-sql.mjs --preset launch-hardening --from 20261012000038 --to 20261012000038 \
//     --out docs/launch/launch-hardening-production.sql
//   node scripts/build-production-sql.mjs --preset new-categories --from 20261012000039 --to 20261012000039 \
//     --out docs/launch/new-categories-production.sql
//   node scripts/build-production-sql.mjs --preset more-categories --from 20261012000040 --to 20261012000040 \
//     --out docs/launch/more-categories-production.sql
//   node scripts/build-production-sql.mjs --preset auto-live --from 20261012000041 --to 20261012000041 \
//     --out docs/launch/auto-live-production.sql
//   node scripts/build-production-sql.mjs --preset one-step --from 20261012000042 --to 20261012000042 \
//     --out docs/launch/one-step-production.sql
//   node scripts/build-production-sql.mjs --preset check-numbers --from 20261012000043 --to 20261012000043 \
//     --out docs/launch/check-numbers-production.sql
//   node scripts/build-production-sql.mjs --preset plaster-recovery --from 20261012000044 --to 20261012000044 \
//     --out docs/launch/plaster-recovery-production.sql
//   node scripts/build-production-sql.mjs --preset builders --from 20261012000045 --to 20261012000045 \
//     --out docs/launch/builders-production.sql
//   node scripts/build-production-sql.mjs --preset air-conditioning --from 20261012000046 --to 20261012000051 \
//     --out docs/launch/air-conditioning-production.sql
//   node scripts/build-production-sql.mjs --preset trader-logos --from 20261012000052 --to 20261012000052 \
//     --out docs/launch/trader-logos-production.sql
//   node scripts/build-production-sql.mjs --preset pro-insights --from 20261012000053 --to 20261012000053 \
//     --out docs/launch/pro-insights-production.sql
//   node scripts/build-production-sql.mjs --preset card-payments --from 20261012000054 --to 20261012000054 \
//     --out docs/launch/card-payments-production.sql
//   node scripts/build-production-sql.mjs --preset pay-links --from 20261012000055 --to <newest> \
//     --out docs/launch/pay-links-production.sql
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

// Availability (migration 000028 onwards): "Taking on work".
const VERIFY_AVAILABILITY = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
declare
  f text;
  c text;
begin
  foreach f in array array['set_my_availability', 'admin_set_availability'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = f) then
      raise exception 'Availability check failed: function public.% is missing', f;
    end if;
  end loop;
  foreach c in array array['availability', 'available_until', 'availability_set_at'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'providers' and column_name = c) then
      raise exception 'Availability check failed: column public.providers.% is missing', c;
    end if;
  end loop;
  foreach c in array array['availability_status', 'availability_until', 'availability_set_at'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'provider_public' and column_name = c) then
      raise exception 'Availability check failed: provider_public has no column %', c;
    end if;
  end loop;
  if not has_table_privilege('anon', 'public.provider_public', 'select') then
    raise exception 'Availability check failed: provider_public is no longer readable by anon';
  end if;
  if has_function_privilege('anon', 'public.set_my_availability(text, date)', 'execute')
     or has_function_privilege('anon', 'public.admin_set_availability(uuid, text, date)', 'execute')
     or has_function_privilege('authenticated', 'private.write_availability(uuid, text, date, text)', 'execute') then
    raise exception 'Availability check failed: availability can be set without signing in';
  end if;
end
$verify$;
`;

// Trader dashboard (migration 000029 onwards): enquiry counts, and the trader's own edits, pause and withdraw.
const VERIFY_TRADER_DASHBOARD = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
declare
  f text;
begin
  foreach f in array array['my_enquiry_stats', 'admin_enquiry_stats', 'update_my_listing', 'pause_my_listing',
                           'unpause_my_listing', 'withdraw_my_listing'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = f) then
      raise exception 'Trader dashboard check failed: function public.% is missing', f;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'providers' and column_name = 'paused_by') then
    raise exception 'Trader dashboard check failed: column public.providers.paused_by is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.providers'::regclass
                 and tgname = 'providers_set_paused_by' and not tgisinternal) then
    raise exception 'Trader dashboard check failed: trigger providers_set_paused_by is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.providers'::regclass
                 and tgname = 'providers_removed_is_final' and not tgisinternal) then
    raise exception 'Trader dashboard check failed: removed is no longer final';
  end if;
  if position('private.enquiries' in pg_get_functiondef('public.enquiry_count(uuid)'::regprocedure)) = 0 then
    raise exception 'Trader dashboard check failed: enquiry_count does not use the shared definition';
  end if;
  if position('paused_by' in pg_get_functiondef('public.provider_my_reviews()'::regprocedure)) = 0 then
    raise exception 'Trader dashboard check failed: provider_my_reviews does not return the listing details';
  end if;
  if has_function_privilege('anon', 'public.my_enquiry_stats(uuid)', 'execute')
     or has_function_privilege('anon', 'public.update_my_listing(uuid, text, text[])', 'execute')
     or has_function_privilege('anon', 'public.withdraw_my_listing(uuid)', 'execute')
     or has_function_privilege('authenticated', 'private.enquiry_stats(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.enquiry_count(uuid)', 'execute') then
    raise exception 'Trader dashboard check failed: enquiry counts or listing edits are reachable without signing in';
  end if;
end
$verify$;
`;

// Pro (migration 000030 onwards): subscriptions, ID documents, work photos and the public view's two columns.
const VERIFY_PRO_TIER = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
declare
  f text;
  t text;
  n int;
begin
  foreach f in array array['stripe_apply_event', 'stripe_event_seen', 'stripe_reconcile_subscription',
                           'stripe_list_subscriptions', 'stripe_customer_for', 'my_pro_status', 'add_my_pro_document',
                           'add_my_work_photo', 'remove_my_work_photo', 'reorder_my_work_photos', 'admin_pro_overview',
                           'admin_pro_document_path', 'admin_decide_pro_document', 'admin_provider_pro',
                           'pro_id_files_due', 'mark_pro_id_files_deleted'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = f) then
      raise exception 'Pro check failed: function public.% is missing', f;
    end if;
  end loop;
  foreach t in array array['subscriptions', 'stripe_events', 'pro_documents', 'work_photos'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'Pro check failed: row level security is off on public.%', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('authenticated', 'public.' || t, 'select') then
      raise exception 'Pro check failed: public.% is readable without the server', t;
    end if;
  end loop;
  foreach t in array array['id_checked', 'photos', 'availability_status'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'provider_public' and column_name = t) then
      raise exception 'Pro check failed: provider_public has no column %', t;
    end if;
  end loop;
  if not has_table_privilege('anon', 'public.provider_public', 'select') then
    raise exception 'Pro check failed: provider_public is no longer readable by anon';
  end if;
  if position('pending_pro_documents' in pg_get_functiondef('public.admin_counts()'::regprocedure)) = 0 then
    raise exception 'Pro check failed: admin_counts does not count ID documents waiting';
  end if;
  if has_function_privilege('anon', 'public.stripe_apply_event(text, text, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.stripe_apply_event(text, text, jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.stripe_apply_event(text, text, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.stripe_customer_for(uuid)', 'execute')
     or has_function_privilege('anon', 'public.add_my_work_photo(uuid, text, int, int)', 'execute') then
    raise exception 'Pro check failed: the Stripe or trader functions are reachable without the right key';
  end if;
  -- Dynamic SQL: a local database without Storage has no storage.buckets to name.
  if to_regclass('storage.buckets') is not null then
    execute $q$select count(*) from storage.buckets
               where (id = 'work-photos' and public) or (id = 'pro-id' and not public)$q$ into n;
    if n <> 2 then
      raise exception 'Pro check failed: the work-photos (public) or pro-id (private) bucket is missing';
    end if;
  end if;
end
$verify$;
`;

// Community questions (migration 000031 onwards): the three tables (no direct access), the two public views, the
// server-only posting functions and the admin's.
const VERIFY_COMMUNITY_QUESTIONS = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
declare
  f text;
  t text;
begin
  foreach f in array array['submit_question', 'question_answer_context', 'submit_question_answer',
                           'report_question_content', 'admin_list_question_queue', 'admin_approve_question',
                           'admin_remove_question', 'admin_remove_question_answer',
                           'admin_dismiss_question_reports'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = f) then
      raise exception 'Community questions check failed: function public.% is missing', f;
    end if;
  end loop;
  foreach t in array array['questions', 'question_answers', 'question_reports'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'Community questions check failed: row level security is off on public.%', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('authenticated', 'public.' || t, 'select')
       or has_table_privilege('service_role', 'public.' || t, 'select') then
      raise exception 'Community questions check failed: public.% is readable directly', t;
    end if;
  end loop;
  foreach t in array array['question_public', 'question_answer_public'] loop
    if not has_table_privilege('anon', 'public.' || t, 'select') then
      raise exception 'Community questions check failed: public.% is not readable by anon', t;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.submit_question(uuid, uuid, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.submit_question(uuid, uuid, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.submit_question_answer(uuid, uuid, text, uuid, text)', 'execute')
     or not has_function_privilege('service_role', 'public.submit_question_answer(uuid, uuid, text, uuid, text)', 'execute') then
    raise exception 'Community questions check failed: posting is reachable without the server';
  end if;
  if position('questions' in pg_get_functiondef('public.admin_counts()'::regprocedure)) = 0 then
    raise exception 'Community questions check failed: admin_counts does not count the questions queue';
  end if;
  if position('question_answers' in pg_get_functiondef('public.delete_my_account()'::regprocedure)) = 0 then
    raise exception 'Community questions check failed: deleting an account leaves its answers up';
  end if;
end
$verify$;
`;

// Price guides (migration 000032 onwards): the threshold setting (10), its reader, and the public totals view, which
// anon can read without being able to read a review.
const VERIFY_PRICE_GUIDES = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if to_regclass('public.price_guide_public') is null then
    raise exception 'Price guides check failed: view public.price_guide_public is missing';
  end if;
  if not exists (select 1 from public.settings where key = 'price_guide_min_reviews') then
    raise exception 'Price guides check failed: setting price_guide_min_reviews is missing';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'private' and p.proname = 'price_guide_min_reviews') then
    raise exception 'Price guides check failed: function private.price_guide_min_reviews is missing';
  end if;
  if private.price_guide_min_reviews() < 10 then
    raise exception 'Price guides check failed: the threshold is below 10';
  end if;
  if not has_table_privilege('anon', 'public.price_guide_public', 'select') then
    raise exception 'Price guides check failed: public.price_guide_public is not readable by anon';
  end if;
  if has_table_privilege('anon', 'public.reviews', 'select') or has_table_privilege('authenticated', 'public.reviews', 'select') then
    raise exception 'Price guides check failed: public.reviews is readable directly';
  end if;
end
$verify$;
`;

const VERIFY_CONSENT_LINK = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'consent_trader_link') then
    raise exception 'Consent link check failed: function public.consent_trader_link is missing';
  end if;
  if has_function_privilege('anon', 'public.consent_trader_link(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.consent_trader_link(uuid)', 'execute') then
    raise exception 'Consent link check failed: public.consent_trader_link must be server-only';
  end if;
  if not has_function_privilege('service_role', 'public.consent_trader_link(uuid)', 'execute') then
    raise exception 'Consent link check failed: the server cannot call public.consent_trader_link';
  end if;
end
$verify$;
`;

const VERIFY_ONE_LISTING = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'providers_one_listing_per_phone') then
    raise exception 'One listing per number check failed: index providers_one_listing_per_phone is missing';
  end if;
end
$verify$;
`;

// Pro, part 2 (migration 000035 onwards): founding Pro, alerts, job requests, Ask Bolton alerts.
const VERIFY_PRO_JOBS = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
declare
  f text;
  t text;
begin
  foreach f in array array['admin_grant_pro', 'admin_revoke_pro_grant', 'my_alert_settings', 'set_my_alert_settings',
                           'submit_job_request', 'claim_job_request_alerts', 'my_job_requests', 'claim_question_alerts',
                           'mark_notification'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = f) then
      raise exception 'Pro jobs check failed: function public.% is missing', f;
    end if;
  end loop;
  foreach t in array array['pro_grants', 'trader_alert_settings', 'notifications', 'job_requests'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'Pro jobs check failed: row level security is off on public.%', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('authenticated', 'public.' || t, 'select') then
      raise exception 'Pro jobs check failed: public.% is readable without the server', t;
    end if;
  end loop;
  if position('pro_grants' in pg_get_functiondef('private.is_pro(uuid)'::regprocedure)) = 0 then
    raise exception 'Pro jobs check failed: is_pro does not count founding Pro';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'provider_public' and column_name = 'takes_requests') then
    raise exception 'Pro jobs check failed: provider_public has no column takes_requests';
  end if;
  if has_function_privilege('anon', 'public.submit_job_request(text, text, text, text, text, text, text)', 'execute')
     or not has_function_privilege('service_role', 'public.submit_job_request(text, text, text, text, text, text, text)', 'execute') then
    raise exception 'Pro jobs check failed: submit_job_request is not server only';
  end if;
end
$verify$;
`;

// Pro, part 3 (migration 000036 onwards): quotes, invoices and the messages to customers.
const VERIFY_QUOTES = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
declare
  f text;
  t text;
begin
  foreach f in array array['save_my_doc', 'my_docs', 'my_doc', 'set_my_doc_status', 'invoice_from_quote', 'set_my_billing',
                           'public_doc', 'answer_quote', 'claim_customer_message', 'due_payment_reminders'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = f) then
      raise exception 'Quotes check failed: function public.% is missing', f;
    end if;
  end loop;
  foreach t in array array['trade_docs', 'trader_billing'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'Quotes check failed: row level security is off on public.%', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('authenticated', 'public.' || t, 'select') then
      raise exception 'Quotes check failed: public.% is readable without the server', t;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.public_doc(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.public_doc(uuid)', 'execute') then
    raise exception 'Quotes check failed: public_doc is not server only';
  end if;
end
$verify$;
`;

const VERIFY_TRADER_SIGN_UP = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
declare
  f text;
begin
  foreach f in array array['plan', 'user_id'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'listing_requests' and column_name = f) then
      raise exception 'Trader sign-up check failed: listing_requests.% is missing', f;
    end if;
  end loop;
  foreach f in array array['my_listing_request', 'admin_approve_listing_request'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = f) then
      raise exception 'Trader sign-up check failed: function public.% is missing', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.submit_listing_request(text, text, text, text, text, text, text, text, uuid, text)', 'execute')
     or not has_function_privilege('service_role', 'public.submit_listing_request(text, text, text, text, text, text, text, text, uuid, text)', 'execute') then
    raise exception 'Trader sign-up check failed: submit_listing_request is not server only';
  end if;
  if has_function_privilege('anon', 'public.admin_approve_listing_request(uuid, uuid)', 'execute') then
    raise exception 'Trader sign-up check failed: admin_approve_listing_request is open to anyone';
  end if;
end
$verify$;
`;

const VERIFY_LAUNCH_HARDENING = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
declare
  f text;
begin
  if to_regclass('public.rate_events') is null then
    raise exception 'Launch hardening check failed: public.rate_events is missing';
  end if;
  foreach f in array array['rate_allow', 'rate_failures', 'rate_fail', 'lock_grant_valid', 'am_i_admin_account'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = f) then
      raise exception 'Launch hardening check failed: function public.% is missing', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.rate_allow(text, text, int, interval)', 'execute')
     or has_function_privilege('authenticated', 'public.lock_grant_valid(text, text)', 'execute') then
    raise exception 'Launch hardening check failed: a server-only function is open';
  end if;
  if (select prosrc from pg_proc where oid = 'public.is_admin()'::regprocedure) not like '%aal2%' then
    raise exception 'Launch hardening check failed: is_admin() does not need the authenticator code';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
             and has_function_privilege('anon', p.oid, 'execute')
             and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')) then
    raise exception 'Launch hardening check failed: a database function is callable without signing in';
  end if;
end
$verify$;
`;

const VERIFY_NEW_CATEGORIES = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if (select count(*) from public.categories where active and slug in ('ev-solar', 'carpets', 'gutter-cleaning', 'kitchen-fitter',
      'bedrooms-wardrobes', 'window-cleaner', 'bathroom-fitter', 'driveways-paving')) <> 8 then
    raise exception 'New categories check failed: one of the eight new trades is missing';
  end if;
  if not exists (select 1 from public.categories where slug = 'cleaner' and name = 'Cleaning services')
     or not exists (select 1 from public.categories where slug = 'caterer' and name = 'Catering services')
     or not exists (select 1 from public.categories where slug = 'valeting' and name = 'Car valeting')
     or not exists (select 1 from public.categories c join public.category_groups g on g.id = c.group_id
                    where c.slug = 'window-door-repair' and c.name = 'Windows, doors & glazing' and g.slug = 'home-trades') then
    raise exception 'New categories check failed: a renamed category is missing its new name';
  end if;
end
$verify$;
`;

const VERIFY_MORE_CATEGORIES = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if (select count(*) from public.categories c join public.category_groups g on g.id = c.group_id
      where c.active and ((c.slug = 'estate-agents' and g.slug = 'moving-waste')
                       or (c.slug = 'accountants' and g.slug = 'business-finance')
                       or (c.slug = 'travel-agents' and g.slug = 'transport')
                       or (c.slug = 'window-tinting' and g.slug = 'vehicles')
                       or (c.slug = 'cctv-security' and g.slug = 'home-trades')
                       or (c.slug = 'venues' and g.slug = 'events-occasions'))) <> 6 then
    raise exception 'More categories check failed: one of the six new trades is missing';
  end if;
  if not exists (select 1 from public.categories where slug = 'mot' and name = 'MOT test')
     or not exists (select 1 from public.categories where slug = 'mechanic' and name = 'Mechanic & car servicing') then
    raise exception 'More categories check failed: MOT test or Mechanic & car servicing was not renamed';
  end if;
  if not exists (select 1 from public.category_groups where slug = 'transport' and name = 'Travel & transport') then
    raise exception 'More categories check failed: the Transport group was not renamed';
  end if;
end
$verify$;
`;

const VERIFY_AUTO_LIVE = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'providers'
      and column_name in ('reviewed_at', 'signup_trade')) <> 2 then
    raise exception 'Auto-live check failed: providers.reviewed_at or providers.signup_trade is missing';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
      and p.proname in ('trader_publish_listing', 'trader_agree_listing', 'admin_mark_provider_reviewed')) <> 3 then
    raise exception 'Auto-live check failed: a sign-up or review function is missing';
  end if;
  if has_function_privilege('authenticated', 'public.trader_publish_listing(uuid, text, text, text, text, text, text, text, text, text, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.trader_agree_listing(uuid, uuid, jsonb)', 'execute') then
    raise exception 'Auto-live check failed: a signed-in account could call the server-only functions';
  end if;
  if exists (select 1 from public.providers where reviewed_at is null and signup_trade is null and user_id is null) then
    raise exception 'Auto-live check failed: an existing listing shows as not checked';
  end if;
end
$verify$;
`;

const VERIFY_ONE_STEP = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if to_regprocedure('public.trader_publish_listing(uuid, text, text, text[], text[], text, text, text, text, text, jsonb)') is null
     or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'trader_publish_listing') <> 1 then
    raise exception 'One-step check failed: trader_publish_listing (trades and areas as lists) is missing, or the old one is still there';
  end if;
  if has_function_privilege('authenticated', 'public.trader_publish_listing(uuid, text, text, text[], text[], text, text, text, text, text, jsonb)', 'execute') then
    raise exception 'One-step check failed: a signed-in account could call trader_publish_listing';
  end if;
end
$verify$;
`;

const VERIFY_CHECK_NUMBERS = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'providers'
                 and column_name = 'signup_refs') then
    raise exception 'Check numbers check failed: providers.signup_refs is missing';
  end if;
  if to_regprocedure('public.trader_publish_listing(uuid, text, text, text[], text[], text, text, text, text, text, jsonb, jsonb)') is null
     or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'trader_publish_listing') <> 1 then
    raise exception 'Check numbers check failed: trader_publish_listing (with the check numbers) is missing, or an old one is still there';
  end if;
  if to_regprocedure('public.admin_confirm_signup_check(uuid, public.check_kind)') is null then
    raise exception 'Check numbers check failed: admin_confirm_signup_check is missing';
  end if;
  if has_function_privilege('authenticated', 'public.trader_publish_listing(uuid, text, text, text[], text[], text, text, text, text, text, jsonb, jsonb)', 'execute') then
    raise exception 'Check numbers check failed: a signed-in account could call trader_publish_listing';
  end if;
end
$verify$;
`;

const VERIFY_PLASTER_RECOVERY = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if (select count(*) from public.categories c join public.category_groups g on g.id = c.group_id
      where c.active and ((c.slug = 'venetian-plaster' and g.slug = 'home-trades')
                       or (c.slug = 'vehicle-recovery' and g.slug = 'vehicles'))) <> 2 then
    raise exception 'Venetian plaster and vehicle recovery check failed: one of the two trades is missing';
  end if;
end
$verify$;
`;

const VERIFY_BUILDERS = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if not exists (select 1 from public.categories c join public.category_groups g on g.id = c.group_id
                 where c.active and c.slug = 'builders' and g.slug = 'home-trades') then
    raise exception 'Builders check failed: the Builders & extensions trade is missing';
  end if;
end
$verify$;
`;

const VERIFY_AIR_CONDITIONING = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if not exists (select 1 from public.categories c join public.category_groups g on g.id = c.group_id
                 where c.active and c.slug = 'air-conditioning' and g.slug = 'home-trades') then
    raise exception 'Air conditioning check failed: the Air conditioning trade is missing';
  end if;
  if not exists (select 1 from public.categories where active and slug = 'fitness' and name = 'Personal trainers & fitness') then
    raise exception 'Air conditioning check failed: Fitness is not renamed to Personal trainers & fitness';
  end if;
  if not exists (select 1 from public.categories c join public.category_groups g on g.id = c.group_id
                 where c.active and c.slug = 'event-hire' and g.slug = 'events-occasions' and g.name = 'Weddings & events')
     or (select count(*) from public.categories
         where slug in ('caterer', 'cakes', 'decor') and name in ('Catering & canapés', 'Cakes & desserts', 'Stages & decor')) <> 3 then
    raise exception 'Air conditioning check failed: the weddings and events changes are missing';
  end if;
  if not exists (select 1 from public.categories c join public.category_groups g on g.id = c.group_id
                 where c.active and c.slug = 'building-surveyors' and g.slug = 'home-trades') then
    raise exception 'Air conditioning check failed: the Building surveyors trade is missing';
  end if;
  if (select count(*) from public.categories c join public.category_groups g on g.id = c.group_id
      where c.active and g.slug = 'home-trades'
        and c.slug in ('fencing-landscaping', 'damp-insulation', 'tree-surgeons')) <> 3
     or not exists (select 1 from public.categories where slug = 'man-and-van' and name = 'Man & van, removals') then
    raise exception 'Air conditioning check failed: the fencing, damp, tree surgeon or removals changes are missing';
  end if;
  if not exists (select 1 from public.categories c join public.category_groups g on g.id = c.group_id
                 where c.active and c.slug = 'cupping-hijama' and g.slug = 'personal-lessons') then
    raise exception 'Air conditioning check failed: the Cupping & hijama trade is missing';
  end if;
end
$verify$;
`;

const VERIFY_TRADER_LOGOS = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
declare
  v_ok boolean;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'provider_public' and column_name = 'logo_path')
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'provider_public' and column_name = 'brand_color') then
    raise exception 'Trader logos check failed: provider_public has no logo_path or brand_color';
  end if;
  if (select count(distinct proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname in ('my_branding', 'set_my_logo', 'set_my_brand_color')) <> 3 then
    raise exception 'Trader logos check failed: a branding function is missing';
  end if;
  -- Only where Storage exists (the rehearsal's local stack has none); dynamic, so it isn't planned without it.
  if to_regclass('storage.buckets') is not null then
    execute 'select exists (select 1 from storage.buckets where id = ''trader-logos'' and public)' into v_ok;
    if not v_ok then
      raise exception 'Trader logos check failed: the public trader-logos bucket is missing';
    end if;
  end if;
end
$verify$;
`;

const VERIFY_PRO_INSIGHTS = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if to_regclass('public.page_view_days') is null or to_regclass('public.page_view_seen') is null then
    raise exception 'Pro insights check failed: the page view tables are missing';
  end if;
  if (select count(distinct proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname in ('record_page_view', 'my_insights', 'due_quote_followups', 'purge_old_page_views')) <> 4 then
    raise exception 'Pro insights check failed: a function is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notifications_kind_check'
                 and pg_get_constraintdef(oid) like '%quote_followup_2%') then
    raise exception 'Pro insights check failed: notifications can''t take quote follow-ups';
  end if;
end
$verify$;
`;

const VERIFY_CARD_PAYMENTS = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if to_regclass('public.trader_stripe') is null or to_regclass('public.card_payments') is null then
    raise exception 'Card payments check failed: a table is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'trade_docs' and column_name = 'deposit_pence') then
    raise exception 'Card payments check failed: quotes have no deposit';
  end if;
  if (select count(distinct proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname in ('set_my_quote_deposit', 'my_card_payments', 'doc_card_payment',
                                                 'record_card_payment', 'set_stripe_account', 'update_stripe_account',
                                                 'stripe_account_of')) <> 7 then
    raise exception 'Card payments check failed: a function is missing';
  end if;
end
$verify$;
`;

const VERIFY_PAY_LINKS = `-- ==================================================================== verification
-- Fails (and so rolls back everything above) if any piece is missing.
do $verify$
begin
  if to_regclass('public.trader_pay_links') is null then
    raise exception 'Pay links check failed: the table is missing';
  end if;
  if (select count(distinct proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname in ('my_pay_link', 'set_my_pay_link')) <> 2 then
    raise exception 'Pay links check failed: a function is missing';
  end if;
  if pg_get_functiondef('public.public_doc(uuid)'::regprocedure) not like '%pay_link%' then
    raise exception 'Pay links check failed: the customer''s copy has no pay_link';
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
  availability: {
    title: "availability database changes (Taking on work)",
    done: "Availability database changes applied",
    // It re-creates provider_my_reviews and admin_get_provider, and the review card script came first.
    requires: { version: "20261012000027", what: "the review card script (docs/launch/review-source-production.sql)" },
    verify: VERIFY_AVAILABILITY,
  },
  "trader-dashboard": {
    title: "trader dashboard database changes (enquiry counts, edit, pause and withdraw)",
    done: "Trader dashboard database changes applied",
    // It re-creates provider_my_reviews (000028's body), so the availability script came first.
    requires: { version: "20261012000028", what: "the availability script (docs/launch/availability-production.sql)" },
    verify: VERIFY_TRADER_DASHBOARD,
  },
  "pro-tier": {
    title: "Pro database changes (subscriptions, ID checks and work photos)",
    done: "Pro database changes applied",
    // It re-creates provider_public (000028's body) and admin_counts, after the trader dashboard script.
    requires: { version: "20261012000029", what: "the trader dashboard script (docs/launch/trader-dashboard-production.sql)" },
    verify: VERIFY_PRO_TIER,
  },
  "community-questions": {
    title: "community questions database changes (Ask Bolton)",
    done: "Community questions database changes applied",
    // It re-creates admin_counts (000030's body) and delete_my_account, after the Pro script.
    requires: { version: "20261012000030", what: "the Pro script (docs/launch/pro-tier-production.sql)" },
    verify: VERIFY_COMMUNITY_QUESTIONS,
  },
  "price-guides": {
    title: "price guides database changes (what locals paid)",
    done: "Price guides database changes applied",
    // Only reads tables that were there long before; after the community questions script, to keep the order simple.
    requires: { version: "20261012000031", what: "the community questions script (docs/launch/community-questions-production.sql)" },
    verify: VERIFY_PRICE_GUIDES,
  },
  "consent-link": {
    title: "\"Manage your listing\" after consent (trader link on the done screen)",
    done: "Consent link database changes applied",
    requires: { version: "20261012000032", what: "the price guides script (docs/launch/price-guides-production.sql)" },
    verify: VERIFY_CONSENT_LINK,
  },
  "one-listing": {
    title: "one listing per phone number",
    done: "One listing per number database changes applied",
    requires: { version: "20261012000033", what: "the consent link script (docs/launch/consent-link-production.sql)" },
    verify: VERIFY_ONE_LISTING,
  },
  "pro-jobs": {
    title: "Pro part 2 (founding Pro, job requests, alerts by text and email)",
    done: "Pro jobs database changes applied",
    // Re-creates provider_public (000030's body plus takes_requests) and private.is_pro.
    requires: { version: "20261012000034", what: "the one listing per number script (docs/launch/one-listing-production.sql)" },
    verify: VERIFY_PRO_JOBS,
  },
  "quotes-invoices": {
    title: "Pro part 3 (quotes, invoices and review requests)",
    done: "Quotes and invoices database changes applied",
    requires: { version: "20261012000035", what: "the Pro jobs script (docs/launch/pro-jobs-production.sql)" },
    verify: VERIFY_QUOTES,
  },
  "trader-sign-up": {
    title: "trader sign-up (one form, Free or Pro, approve and notify)",
    done: "Trader sign-up database changes applied",
    requires: { version: "20261012000036", what: "the quotes and invoices script (docs/launch/quotes-invoices-production.sql)" },
    verify: VERIFY_TRADER_SIGN_UP,
  },
  "launch-hardening": {
    title: "launch hardening (two-step admin, rate limits, the lock's link check, trader records on unlink)",
    done: "Launch hardening database changes applied",
    requires: { version: "20261012000037", what: "the trader sign-up script (docs/launch/trader-sign-up-production.sql)" },
    verify: VERIFY_LAUNCH_HARDENING,
  },
  "new-categories": {
    title: "new categories (eight new trades; Cleaning services, Catering services, Car valeting and Windows, doors & glazing renamed)",
    done: "New categories applied",
    requires: { version: "20261012000038", what: "the launch hardening script (docs/launch/launch-hardening-production.sql)" },
    verify: VERIFY_NEW_CATEGORIES,
  },
  "more-categories": {
    title: "more categories (Estate agents, Accountants, Travel agents, Window tinting, CCTV & security, Wedding & event venues; MOT test and Mechanic & car servicing renamed)",
    done: "More categories applied",
    requires: { version: "20261012000039", what: "the new categories script (docs/launch/new-categories-production.sql)" },
    verify: VERIFY_MORE_CATEGORIES,
  },
  "auto-live": {
    title: "trader sign-ups go live straight away (agree in the form; the admin checks afterwards)",
    done: "Auto-live sign-up applied",
    requires: { version: "20261012000040", what: "the more categories script (docs/launch/more-categories-production.sql)" },
    verify: VERIFY_AUTO_LIVE,
  },
  "one-step": {
    title: "one-step trader sign-up (tick trades and areas, mobile and WhatsApp, Confirm)",
    done: "One-step sign-up applied",
    requires: { version: "20261012000041", what: "the auto-live script (docs/launch/auto-live-production.sql)" },
    verify: VERIFY_ONE_STEP,
  },
  "check-numbers": {
    title: "check numbers at sign-up (ADI badge and Gas Safe numbers, confirmed by the admin with one button)",
    done: "Check numbers applied",
    requires: { version: "20261012000042", what: "the one-step script (docs/launch/one-step-production.sql)" },
    verify: VERIFY_CHECK_NUMBERS,
  },
  "plaster-recovery": {
    title: "Venetian plaster and vehicle recovery (two new trades)",
    done: "Venetian plaster and vehicle recovery applied",
    requires: { version: "20261012000043", what: "the check numbers script (docs/launch/check-numbers-production.sql)" },
    verify: VERIFY_PLASTER_RECOVERY,
  },
  builders: {
    title: "Builders & extensions (a new trade)",
    done: "Builders applied",
    requires: { version: "20261012000044", what: "the Venetian plaster and recovery script (docs/launch/plaster-recovery-production.sql)" },
    verify: VERIFY_BUILDERS,
  },
  "air-conditioning": {
    title: "New trades and renames of 26 October (air conditioning to cupping and hijama)",
    done: "Air conditioning applied",
    requires: { version: "20261012000045", what: "the builders script (docs/launch/builders-production.sql)" },
    verify: VERIFY_AIR_CONDITIONING,
  },
  "trader-logos": {
    title: "Trader logos and the Pro cover colour",
    done: "Trader logos applied",
    requires: { version: "20261012000051", what: "the new trades script (docs/launch/air-conditioning-production.sql)" },
    verify: VERIFY_TRADER_LOGOS,
  },
  "pro-insights": {
    title: "Page views, the Pro demand report and quote follow-ups",
    done: "Pro insights applied",
    requires: { version: "20261012000052", what: "the trader logos script (docs/launch/trader-logos-production.sql)" },
    verify: VERIFY_PRO_INSIGHTS,
  },
  "card-payments": {
    title: "Card payments and deposits through the trader's own Stripe account",
    done: "Card payments applied",
    requires: { version: "20261012000053", what: "the Pro insights script (docs/launch/pro-insights-production.sql)" },
    verify: VERIFY_CARD_PAYMENTS,
  },
  "pay-links": {
    title: "Traders' own card payment links (SumUp, Square, PayPal...) on invoices",
    done: "Pay links applied",
    requires: { version: "20261012000054", what: "the card payments script (docs/launch/card-payments-production.sql)" },
    verify: VERIFY_PAY_LINKS,
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
