import "server-only";
import type { Plan, StripeConfig } from "@/lib/pro";
import { absoluteUrl } from "@/lib/seo";
import { stripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * A Stripe Checkout page for Pro on one listing: from the dashboard's upgrade and straight after the sign-up form.
 * A returning trader keeps their Stripe customer (and saved card); a new one is created by Checkout. Returns the page's
 * address, or null if Stripe didn't give one. Throws on a Stripe error, for the caller to log.
 */
export async function proCheckoutUrl(
  cfg: StripeConfig,
  o: { providerId: string; email: string | null; plan: Plan; successPath: string; cancelPath: string },
): Promise<string | null> {
  const { data: customer } = await createServiceClient().rpc("stripe_customer_for", { p_provider: o.providerId });
  const session = await stripeClient(cfg).checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: cfg.prices[o.plan], quantity: 1 }],
    client_reference_id: o.providerId,
    ...(typeof customer === "string" && customer ? { customer } : o.email ? { customer_email: o.email } : {}),
    metadata: { provider_id: o.providerId },
    subscription_data: { metadata: { provider_id: o.providerId } },
    success_url: absoluteUrl(o.successPath),
    cancel_url: absoluteUrl(o.cancelPath),
  });
  return session.url;
}
