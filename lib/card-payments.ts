import "server-only";
import type Stripe from "stripe";
import type { StripeConfig } from "@/lib/pro";
import { platformPath } from "@/lib/paths";
import { absoluteUrl } from "@/lib/seo";
import { stripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { publicDocPath } from "@/lib/trade-docs";

// Card payments for Pro traders (migration 000054), with no cut for us: each trader connects a Stripe account of
// their own (Stripe Connect, with a full Stripe dashboard; they pay Stripe's fee and handle their own refunds and
// disputes), and their customers pay an invoice, or a deposit on an accepted quote, by card through Stripe Checkout
// on that account. The money never touches our Stripe account. A payment is recorded once, from the customer's
// return or Stripe's webhook (app/api/stripe/connect/route.ts), whichever is first.

/** What the customer can pay by card on a doc now (doc_card_payment). */
export type CardPayment = {
  doc_id: string;
  what: "invoice" | "deposit";
  amount_pence: number;
  account_id: string;
  token: string;
  label: string;
  business_name: string;
};

const ACCOUNT = /^acct_[A-Za-z0-9]{6,64}$/;
export const SESSION = /^cs_[A-Za-z0-9_]{6,200}$/;

/**
 * The Stripe onboarding page for a listing's account: creates the account the first time (a full Stripe account
 * of the trader's own), then a fresh single-use link. Returns its address. Throws on a Stripe error.
 */
export async function onboardingUrl(cfg: StripeConfig, o: { providerId: string; email: string | null; slug: string }): Promise<string> {
  const db = createServiceClient();
  const stripe = stripeClient(cfg);
  const { data: existing, error } = await db.rpc("stripe_account_of", { p_provider: o.providerId });
  if (error) throw new Error(`stripe_account_of: ${error.message}`);
  let account = typeof existing === "string" && ACCOUNT.test(existing) ? existing : null;
  if (!account) {
    const created = await stripe.accounts.create({
      country: "GB",
      ...(o.email ? { email: o.email } : {}),
      controller: {
        fees: { payer: "account" },
        losses: { payments: "stripe" },
        requirement_collection: "stripe",
        stripe_dashboard: { type: "full" },
      },
      business_profile: { url: absoluteUrl(platformPath("p", o.slug)) },
      metadata: { provider_id: o.providerId },
    });
    const { data: kept, error: e } = await db.rpc("set_stripe_account", { p_provider: o.providerId, p_account: created.id });
    if (e) throw new Error(`set_stripe_account: ${e.message}`);
    account = String(kept);
  }
  const link = await stripe.accountLinks.create({
    account,
    type: "account_onboarding",
    refresh_url: absoluteUrl(`${platformPath("provider")}?card=retry#card`),
    return_url: absoluteUrl(`${platformPath("provider")}?card=back#card`),
  });
  return link.url;
}

/** Asks Stripe whether the account can take payments yet, and stores the answer. Never throws. */
export async function refreshAccount(cfg: StripeConfig, providerId: string): Promise<void> {
  try {
    const db = createServiceClient();
    const { data } = await db.rpc("stripe_account_of", { p_provider: providerId });
    if (typeof data !== "string" || !ACCOUNT.test(data)) return;
    const a = await stripeClient(cfg).accounts.retrieve(data);
    await storeAccount(a);
  } catch (err) {
    console.error("card payments: account check failed:", err instanceof Error ? err.message : err);
  }
}

export async function storeAccount(a: Pick<Stripe.Account, "id" | "charges_enabled" | "details_submitted">): Promise<void> {
  const { error } = await createServiceClient().rpc("update_stripe_account", {
    p_account: a.id,
    p_charges: a.charges_enabled === true,
    p_details: a.details_submitted === true,
  });
  if (error) throw new Error(`update_stripe_account: ${error.message}`);
}

/** What's payable by card on the doc with this token, or null. */
export async function cardPaymentFor(token: string): Promise<CardPayment | null> {
  const { data, error } = await createServiceClient().rpc("doc_card_payment", { p_token: token });
  if (error) throw new Error(`doc_card_payment: ${error.message}`);
  return (data as CardPayment | null) ?? null;
}

/** A Stripe Checkout page, on the trader's account, for what's payable. Returns its address. Throws on a Stripe error. */
export async function cardCheckoutUrl(cfg: StripeConfig, p: CardPayment): Promise<string | null> {
  const name = p.what === "deposit" ? `Deposit for quote ${p.label} from ${p.business_name}` : `Invoice ${p.label} from ${p.business_name}`;
  const back = absoluteUrl(publicDocPath(p.token));
  const session = await stripeClient(cfg).checkout.sessions.create(
    {
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: p.amount_pence, product_data: { name: name.slice(0, 250) } } }],
      metadata: { doc_id: p.doc_id, what: p.what },
      payment_intent_data: { description: name.slice(0, 250), metadata: { doc_id: p.doc_id, what: p.what } },
      success_url: `${back}?card={CHECKOUT_SESSION_ID}`,
      cancel_url: back,
    },
    { stripeAccount: p.account_id },
  );
  return session.url;
}

export type Recorded = { result: "recorded" | "already" | "mismatch" | "not_payable"; kind?: string; ask_review?: boolean };

/** Records a paid Checkout session on a connected account (the database checks doc, account and amount). */
export async function recordPaidSession(session: Stripe.Checkout.Session, account: string): Promise<Recorded | null> {
  const docId = session.metadata?.doc_id;
  if (session.payment_status !== "paid" || !docId || typeof session.amount_total !== "number") return null;
  const { data, error } = await createServiceClient().rpc("record_card_payment", {
    p_session: session.id,
    p_doc: docId,
    p_account: account,
    p_amount: session.amount_total,
  });
  if (error) throw new Error(`record_card_payment: ${error.message}`);
  return data as Recorded;
}

/**
 * The customer's return from Stripe (?card=<session id>): checks the session on the trader's account and records it,
 * in case the webhook hasn't yet. Returns whether a payment was recorded now and a review request is due. Never throws.
 */
export async function confirmReturn(cfg: StripeConfig, token: string, sessionId: string): Promise<Recorded | null> {
  if (!SESSION.test(sessionId)) return null;
  try {
    const pay = await cardPaymentFor(token);
    if (!pay) return null;
    const session = await stripeClient(cfg).checkout.sessions.retrieve(sessionId, {}, { stripeAccount: pay.account_id });
    if (session.metadata?.doc_id !== pay.doc_id) return null;
    return await recordPaidSession(session, pay.account_id);
  } catch (err) {
    console.error("card payments: return check failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
