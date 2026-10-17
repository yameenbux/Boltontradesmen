import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeConfig, webhookSecret } from "@/lib/pro";
import { revalidatePublicPages } from "@/lib/revalidate-public";
import { stripeClient, stripeVerifier } from "@/lib/stripe";
import { handleStripeEvent, type ApplyResult } from "@/lib/stripe-webhook";
import { createServiceClient } from "@/lib/supabase/service";

// Stripe's webhook (docs/launch/LAUNCH.md, "Pro"): checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted and invoice.payment_failed. The raw body is checked against STRIPE_WEBHOOK_SECRET
// before anything is read from it; a bad or missing signature is a 400. Each event is applied once (by its id).
// Outside proxy.ts's matcher: no cookies, no session.
export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing Stripe-Signature" }, 400);
  const secret = webhookSecret();
  if (!secret) return json({ error: "Webhook not configured" }, 503);

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripeVerifier().webhooks.constructEvent(raw, signature, secret);
  } catch {
    return json({ error: "Bad signature" }, 400);
  }

  const db = createServiceClient();
  let result: ApplyResult;
  try {
    result = await handleStripeEvent(event, {
      seen: async (id) => {
        const { data, error } = await db.rpc("stripe_event_seen", { p_event_id: id });
        if (error) throw new Error(`stripe_event_seen: ${error.message}`);
        return data === true;
      },
      retrieveSubscription: async (id) => {
        const cfg = stripeConfig();
        if (!cfg) throw new Error("Stripe is not configured, so the subscription can't be fetched");
        return stripeClient(cfg).subscriptions.retrieve(id);
      },
      apply: async (id, type, row) => {
        const { data, error } = await db.rpc("stripe_apply_event", { p_event_id: id, p_type: type, p_sub: row });
        if (error) throw new Error(`stripe_apply_event: ${error.message}`);
        const r = (data ?? {}) as { outcome?: unknown; slug?: unknown };
        return { outcome: String(r.outcome ?? ""), slug: typeof r.slug === "string" ? r.slug : null };
      },
      revalidate: (slug) => revalidatePublicPages(slug),
    });
  } catch (err) {
    // Stripe sends it again (with backoff) on any non-2xx. Only the event id and type are logged, never its data.
    console.error(`stripe webhook: ${event.type} ${event.id} failed:`, err instanceof Error ? err.message : err);
    return json({ error: "Not processed" }, 500);
  }
  if (result.outcome === "unknown_provider") {
    console.error(`stripe webhook: ${event.type} ${event.id} names no listing we know; check it in Stripe`);
  }
  return json({ received: true, outcome: result.outcome }, 200);
}
