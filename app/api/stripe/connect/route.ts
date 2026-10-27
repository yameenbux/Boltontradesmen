import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { recordPaidSession, storeAccount } from "@/lib/card-payments";
import { deliverCustomerMessage } from "@/lib/notify";
import { stripeVerifier } from "@/lib/stripe";

// Stripe's webhook for traders' own accounts (Connect: "Events on connected accounts"): checkout.session.completed
// records a card payment (the customer may never come back to the page), account.updated keeps "can take payments"
// current. Its own signing secret, STRIPE_CONNECT_WEBHOOK_SECRET; a bad or missing signature is a 400. Both are safe
// to receive twice. Outside proxy.ts's matcher: no cookies, no session.
export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing Stripe-Signature" }, 400);
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();
  if (!secret) return json({ error: "Webhook not configured" }, 503);
  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripeVerifier().webhooks.constructEvent(raw, signature, secret);
  } catch {
    return json({ error: "Bad signature" }, 400);
  }
  try {
    if (event.type === "account.updated") {
      await storeAccount(event.data.object);
    } else if (event.type === "checkout.session.completed" && event.account) {
      const r = await recordPaidSession(event.data.object, event.account);
      const docId = event.data.object.metadata?.doc_id;
      if (r?.result === "recorded" && r.ask_review && docId) await deliverCustomerMessage("review_request", docId);
      if (r && (r.result === "mismatch" || r.result === "not_payable")) {
        console.error(`stripe connect: ${event.id} paid session ${event.data.object.id} didn't match its doc (${r.result})`);
      }
    }
  } catch (err) {
    console.error(`stripe connect: ${event.type} ${event.id} failed:`, err instanceof Error ? err.message : err);
    return json({ error: "Not processed" }, 500);
  }
  return json({ received: true }, 200);
}
