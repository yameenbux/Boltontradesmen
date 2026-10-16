import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleStripeEvent, subscriptionRow, type WebhookDeps } from "@/lib/stripe-webhook";

const rpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc }) }));
const revalidated: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidated.push(p) }));

import { POST } from "@/app/api/stripe/webhook/route";

const SECRET = "whsec_unit_test_secret";
const PROVIDER = "0b8e1f0a-1111-4222-8333-444455556666";
const ENV = { STRIPE_PRICE_MONTHLY: "price_month", STRIPE_PRICE_ANNUAL: "price_year" };
const stripe = new Stripe("sk_test_unit");

function subscription(over: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    object: "subscription",
    customer: "cus_123",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { provider_id: PROVIDER },
    items: { data: [{ price: { id: "price_month", recurring: { interval: "month" } }, current_period_end: 1_795_000_000 }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

function event(type: string, object: unknown, id = "evt_1", created = 1_790_000_000): Stripe.Event {
  return { id, type, created, object: "event", data: { object } } as unknown as Stripe.Event;
}

function deps(over: Partial<WebhookDeps> = {}) {
  const d = {
    seen: vi.fn(async () => false),
    retrieveSubscription: vi.fn(async () => subscription({ status: "past_due" })),
    apply: vi.fn(async () => ({ outcome: "applied", slug: "ace" })),
    revalidate: vi.fn(),
    now: () => new Date("2026-10-16T12:00:00Z"),
    env: ENV,
    ...over,
  };
  return d;
}

describe("subscriptionRow", () => {
  it("takes the plan from our price, the period end from the item, the listing from the metadata", () => {
    expect(subscriptionRow(subscription(), new Date("2026-10-16T12:00:00Z"), null, ENV)).toEqual({
      provider_id: PROVIDER,
      customer: "cus_123",
      subscription: "sub_123",
      plan: "monthly",
      status: "active",
      current_period_end: new Date(1_795_000_000 * 1000).toISOString(),
      cancel_at_period_end: false,
      as_of: "2026-10-16T12:00:00.000Z",
    });
  });
  it("a cancellation date (newer API) counts as cancelling at the period end", () => {
    expect(subscriptionRow(subscription({ cancel_at: 1_795_000_000 }), new Date(), null, ENV)?.cancel_at_period_end).toBe(true);
  });
  it("ignores a provider id that isn't a uuid, and subscriptions to prices that aren't ours", () => {
    expect(subscriptionRow(subscription({ metadata: { provider_id: "x' or 1=1" } }), new Date(), null, ENV)?.provider_id).toBeNull();
    const weekly = subscription({ items: { data: [{ price: { id: "price_w", recurring: { interval: "week" } } }] } });
    expect(subscriptionRow(weekly, new Date(), null, ENV)).toBeNull();
  });
});

describe("handleStripeEvent", () => {
  it("a subscription update is stored as of the event's time, then the profile is refreshed", async () => {
    const d = deps();
    await handleStripeEvent(event("customer.subscription.updated", subscription({ status: "past_due" })), d);
    expect(d.retrieveSubscription).not.toHaveBeenCalled();
    expect(d.apply).toHaveBeenCalledWith("evt_1", "customer.subscription.updated", expect.objectContaining({
      status: "past_due",
      as_of: new Date(1_790_000_000 * 1000).toISOString(),
    }));
    expect(d.revalidate).toHaveBeenCalledWith("ace");
  });

  it("a deleted subscription is stored (Pro ends)", async () => {
    const d = deps();
    await handleStripeEvent(event("customer.subscription.deleted", subscription({ status: "canceled" })), d);
    expect(d.apply).toHaveBeenCalledWith("evt_1", "customer.subscription.deleted", expect.objectContaining({ status: "canceled" }));
  });

  it("checkout fetches the subscription fresh and names the listing our server put on the session", async () => {
    const d = deps({ retrieveSubscription: vi.fn(async () => subscription({ metadata: {} })) });
    const session = { mode: "subscription", subscription: "sub_123", client_reference_id: PROVIDER, customer: "cus_123" };
    await handleStripeEvent(event("checkout.session.completed", session), d);
    expect(d.retrieveSubscription).toHaveBeenCalledWith("sub_123");
    expect(d.apply).toHaveBeenCalledWith("evt_1", "checkout.session.completed", expect.objectContaining({
      provider_id: PROVIDER,
      as_of: "2026-10-16T12:00:00.000Z",
    }));
  });

  it("a failed payment fetches its subscription (found under the invoice's parent)", async () => {
    const d = deps();
    const invoice = { parent: { subscription_details: { subscription: "sub_999" } } };
    await handleStripeEvent(event("invoice.payment_failed", invoice), d);
    expect(d.retrieveSubscription).toHaveBeenCalledWith("sub_999");
    expect(d.apply).toHaveBeenCalledWith("evt_1", "invoice.payment_failed", expect.objectContaining({ status: "past_due" }));
  });

  it("is idempotent: an event already handled does nothing at all", async () => {
    const d = deps({ seen: vi.fn(async () => true) });
    const out = await handleStripeEvent(event("customer.subscription.updated", subscription()), d);
    expect(out.outcome).toBe("duplicate");
    expect(d.apply).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it("the same event delivered twice is applied once (the database says duplicate the second time)", async () => {
    const outcomes = ["applied", "duplicate"];
    const d = deps({ apply: vi.fn(async () => ({ outcome: outcomes.shift() as string, slug: null })) });
    const e = event("customer.subscription.updated", subscription());
    expect((await handleStripeEvent(e, d)).outcome).toBe("applied");
    expect((await handleStripeEvent(e, d)).outcome).toBe("duplicate");
  });

  it("other events are only recorded; stale or unchanged data refreshes nothing", async () => {
    const d = deps({ apply: vi.fn(async () => ({ outcome: "stale", slug: "ace" })) });
    await handleStripeEvent(event("invoice.paid", {}), d);
    expect(d.apply).toHaveBeenCalledWith("evt_1", "invoice.paid", null);
    await handleStripeEvent(event("customer.subscription.updated", subscription()), d);
    expect(d.revalidate).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook", () => {
  const body = JSON.stringify(event("customer.subscription.updated", subscription(), "evt_route"));
  const request = (payload: string, signature?: string) =>
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: signature ? { "stripe-signature": signature } : {},
      body: payload,
    });
  const signed = (payload: string, secret = SECRET) => stripe.webhooks.generateTestHeaderString({ payload, secret });

  beforeEach(() => {
    rpc.mockReset();
    revalidated.length = 0;
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_month");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllEnvs());

  it("400 without a signature", async () => {
    expect((await POST(request(body))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("400 for a signature made with another secret, before anything is read", async () => {
    const res = await POST(request(body, signed(body, "whsec_someone_else")));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("400 when the body was changed after signing", async () => {
    const res = await POST(request(body.replace("active", "trialing"), signed(body)));
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("503 when no webhook secret is set (Stripe not set up)", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await POST(request(body, signed(body)))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("200 for a good signature: applied once, the profile refreshed", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "stripe_event_seen" ? { data: false, error: null } : { data: { outcome: "applied", slug: "ace" }, error: null },
    );
    const res = await POST(request(body, signed(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: "applied" });
    expect(rpc).toHaveBeenCalledWith("stripe_apply_event", expect.objectContaining({ p_event_id: "evt_route" }));
    expect(revalidated).toContain("/platform/p/ace");
  });

  it("500 when the database fails, so Stripe sends it again", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await POST(request(body, signed(body)))).status).toBe(500);
  });
});
