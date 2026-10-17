// Stripe's webhook, minus the HTTP: which events change a subscription, and how Stripe's subscription becomes the
// row public.stripe_apply_event stores (migration 000030). The route (app/api/stripe/webhook/route.ts) verifies the
// signature first; nothing here trusts anything that didn't come from Stripe. Each event is handled once (by its id),
// and a late, older event never overwrites newer data (the row keeps the time its data was true).
import type Stripe from "stripe";
import { planForPrice } from "@/lib/pro";

type Env = Record<string, string | undefined>;

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
] as const;

/** What public.stripe_apply_event stores for one subscription. */
export type SubscriptionRow = {
  provider_id: string | null;
  customer: string;
  subscription: string;
  plan: "monthly" | "annual";
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** When this data was true: the event's time, or now for a fresh fetch. */
  as_of: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);
const iso = (unix: number | null | undefined) => (typeof unix === "number" ? new Date(unix * 1000).toISOString() : null);

/**
 * The row for a Stripe subscription, or null when it isn't one of ours (no plan we sell). The listing comes from the
 * subscription's metadata, which our Checkout session set; for an existing row the database ignores it anyway.
 */
export function subscriptionRow(
  sub: Stripe.Subscription,
  asOf: Date,
  providerId: string | null = null,
  env: Env = process.env,
): SubscriptionRow | null {
  const item = sub.items?.data?.[0];
  const plan = planForPrice(item?.price?.id, item?.price?.recurring?.interval, env);
  const customer = idOf(sub.customer);
  if (!plan || !customer) return null;
  const fromMeta = sub.metadata?.provider_id;
  const provider = providerId ?? (fromMeta && UUID.test(fromMeta) ? fromMeta : null);
  // Newer API versions keep the period on the item; older ones on the subscription.
  const periodEnd =
    (item as { current_period_end?: number } | undefined)?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  return {
    provider_id: provider && UUID.test(provider) ? provider : null,
    customer,
    subscription: sub.id,
    plan,
    status: sub.status,
    current_period_end: iso(periodEnd),
    cancel_at_period_end: sub.cancel_at_period_end === true || typeof sub.cancel_at === "number",
    as_of: asOf.toISOString(),
  };
}

export type ApplyResult = { outcome: string; slug: string | null };

export type WebhookDeps = {
  /** stripe_event_seen: already handled? (Saves a Stripe call; stripe_apply_event checks again.) */
  seen(eventId: string): Promise<boolean>;
  /** A subscription as Stripe has it now. */
  retrieveSubscription(id: string): Promise<Stripe.Subscription>;
  /** stripe_apply_event. */
  apply(eventId: string, type: string, row: SubscriptionRow | null): Promise<ApplyResult>;
  /** Refreshes the listing's public pages when what they show may have changed. */
  revalidate(slug: string): void;
  now?: () => Date;
  env?: Env;
};

/** The subscription id an invoice belongs to (newer API versions moved it under parent). */
function invoiceSubscription(inv: Stripe.Invoice): string | null {
  const parent = (inv as { parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null }).parent;
  const fromParent = idOf(parent?.subscription_details?.subscription ?? null);
  if (fromParent) return fromParent;
  return idOf((inv as unknown as { subscription?: string | { id: string } | null }).subscription ?? null);
}

/**
 * Handles one verified event. Subscription events carry the whole subscription (stored as of the event's time);
 * checkout and failed-payment events name one, which is fetched fresh (stored as of now). Everything else is just
 * recorded. Returns the outcome; throws when the database or Stripe fails, so Stripe sends it again.
 */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<ApplyResult> {
  if (await deps.seen(event.id)) return { outcome: "duplicate", slug: null };
  const now = deps.now ?? (() => new Date());
  let row: SubscriptionRow | null = null;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subId = idOf(session.subscription);
      if (session.mode === "subscription" && subId) {
        // client_reference_id is the listing our server put on the session (the person never sees or sets it).
        const ref = session.client_reference_id && UUID.test(session.client_reference_id) ? session.client_reference_id : null;
        const sub = await deps.retrieveSubscription(subId);
        row = subscriptionRow(sub, now(), ref, deps.env);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      row = subscriptionRow(sub, new Date(event.created * 1000), null, deps.env);
      break;
    }
    case "invoice.payment_failed": {
      const subId = invoiceSubscription(event.data.object as Stripe.Invoice);
      if (subId) row = subscriptionRow(await deps.retrieveSubscription(subId), now(), null, deps.env);
      break;
    }
  }

  const result = await deps.apply(event.id, event.type, row);
  if (result.outcome === "applied" && result.slug) deps.revalidate(result.slug);
  return result;
}
