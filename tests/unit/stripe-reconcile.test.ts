import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { subscriptionRow } from "@/lib/stripe-webhook";
import { differences, rowFromSubscription } from "../../scripts/stripe-reconcile.mjs";

const ENV = { STRIPE_PRICE_MONTHLY: "price_month", STRIPE_PRICE_ANNUAL: "price_year" };
const AS_OF = new Date("2026-10-16T12:00:00Z");

const subs = [
  { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, cancel_at: null, metadata: { provider_id: "0b8e1f0a-1111-4222-8333-444455556666" }, items: { data: [{ price: { id: "price_year", recurring: { interval: "year" } }, current_period_end: 1_800_000_000 }] } },
  { id: "sub_2", customer: { id: "cus_2" }, status: "past_due", cancel_at_period_end: true, metadata: {}, items: { data: [{ price: { id: "price_x", recurring: { interval: "month" } } }] }, current_period_end: 1_790_000_000 },
  { id: "sub_3", customer: "cus_3", status: "active", cancel_at_period_end: false, cancel_at: 1_800_000_000, metadata: { provider_id: "nope" }, items: { data: [{ price: { id: "price_w", recurring: { interval: "week" } } }] } },
];

describe("scripts/stripe-reconcile.mjs", () => {
  it.each(subs.map((s) => [s.id, s]))("maps %s exactly as the webhook does", (_id, s) => {
    expect(rowFromSubscription(s, AS_OF, ENV)).toEqual(subscriptionRow(s as unknown as Stripe.Subscription, AS_OF, null, ENV));
  });

  it("lists what differs", () => {
    const row = rowFromSubscription(subs[0], AS_OF, ENV);
    expect(differences(row, null)).toEqual(["missing"]);
    expect(differences(row, { ...row })).toEqual([]);
    expect(differences(row, { ...row, status: "past_due", cancel_at_period_end: true })).toEqual([
      "status past_due -> active",
      "cancel at period end -> false",
    ]);
    expect(differences(row, { ...row, current_period_end: "2027-01-16T08:00:00+00:00" })).toEqual(["period end"]);
  });
});
