#!/usr/bin/env node
// Compares Stripe's subscriptions with public.subscriptions and fixes any drift (a webhook that never arrived, an
// endpoint that was down, a change made by hand in the Stripe Dashboard). Run it by hand (docs/launch/LAUNCH.md, "Pro");
// there is no schedule yet.
//
//   node --env-file=.env.production.local scripts/stripe-reconcile.mjs          # dry run: lists what differs
//   node --env-file=.env.production.local scripts/stripe-reconcile.mjs --fix    # writes Stripe's values
//
// Needs STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY. Stripe is the source of truth: its values are written through
// public.stripe_reconcile_subscription (service role only, audited as 'stripe_reconcile'). A subscription the table
// doesn't have is added when its metadata names a listing (our Checkout sets it). Rows Stripe no longer has are only
// reported. Never prints keys or card details: only subscription and customer ids, statuses and dates.
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { fileURLToPath } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mirrors lib/stripe-webhook.ts subscriptionRow (tests/unit/stripe-reconcile.test.ts keeps the two in step).
 * @param {any} sub a Stripe subscription
 * @param {Date} asOf
 * @param {Record<string, string | undefined>} [env]
 */
export function rowFromSubscription(sub, asOf, env = process.env) {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  const plan =
    price?.id && price.id === env.STRIPE_PRICE_MONTHLY?.trim()
      ? "monthly"
      : price?.id && price.id === env.STRIPE_PRICE_ANNUAL?.trim()
        ? "annual"
        : price?.recurring?.interval === "month"
          ? "monthly"
          : price?.recurring?.interval === "year"
            ? "annual"
            : null;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  if (!plan || !customer) return null;
  const meta = sub.metadata?.provider_id;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
  return {
    provider_id: meta && UUID.test(meta) ? meta : null,
    customer,
    subscription: sub.id,
    plan,
    status: sub.status,
    current_period_end: typeof periodEnd === "number" ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end === true || typeof sub.cancel_at === "number",
    as_of: asOf.toISOString(),
  };
}

/**
 * The fields that differ between Stripe's row and the stored one ([] when they match).
 * @param {any} stripeRow
 * @param {any} stored
 */
export function differences(stripeRow, stored) {
  if (!stored) return ["missing"];
  const out = [];
  const time = (v) => (v ? new Date(v).getTime() : null);
  if (stripeRow.status !== stored.status) out.push(`status ${stored.status} -> ${stripeRow.status}`);
  if (stripeRow.plan !== stored.plan) out.push(`plan ${stored.plan} -> ${stripeRow.plan}`);
  if (stripeRow.customer !== stored.customer) out.push("customer");
  if (time(stripeRow.current_period_end) !== time(stored.current_period_end)) out.push("period end");
  if (stripeRow.cancel_at_period_end !== stored.cancel_at_period_end) out.push(`cancel at period end -> ${stripeRow.cancel_at_period_end}`);
  return out;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const need = ["STRIPE_SECRET_KEY", "STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_ANNUAL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = need.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    console.error(`stripe-reconcile: set ${missing.join(", ")} first (see docs/launch/LAUNCH.md, "Pro")`);
    process.exit(2);
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim(), { maxNetworkRetries: 2 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: storedRows, error } = await db.rpc("stripe_list_subscriptions");
  if (error) throw new Error(`stripe_list_subscriptions: ${error.message}`);
  const stored = new Map((storedRows ?? []).map((r) => [r.subscription, r]));
  const seen = new Set();
  let drift = 0;
  let fixed = 0;

  for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) {
    const row = rowFromSubscription(sub, new Date());
    if (!row) continue; // not one of our prices
    seen.add(row.subscription);
    const diff = differences(row, stored.get(row.subscription));
    if (diff.length === 0) continue;
    drift++;
    console.log(`${row.subscription} (${row.customer}): ${diff.join(", ")}`);
    if (!fix) continue;
    const { data, error: e } = await db.rpc("stripe_reconcile_subscription", { p_sub: row });
    if (e) {
      console.error(`  could not fix: ${e.message}`);
      continue;
    }
    console.log(`  ${data?.outcome ?? "?"}`);
    if (data?.outcome === "applied" || data?.outcome === "unchanged") fixed++;
  }
  for (const id of stored.keys()) {
    if (!seen.has(id)) console.log(`${id}: in the table but not in this Stripe account (test mode, or deleted?)`);
  }
  console.log(
    drift === 0
      ? "stripe-reconcile: everything matches"
      : fix
        ? `stripe-reconcile: ${drift} differed, ${fixed} fixed`
        : `stripe-reconcile: ${drift} differ; run again with --fix to write Stripe's values`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("stripe-reconcile failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
