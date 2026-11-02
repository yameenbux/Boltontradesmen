import "server-only";
import type Stripe from "stripe";
import { FOUNDING_FIRST_CHARGE, FOUNDING_UNTIL } from "@/lib/founding";
import type { Plan, StripeConfig } from "@/lib/pro";
import { PRO_PRICE } from "@/lib/pro-features";
import { absoluteUrl } from "@/lib/seo";
import { stripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * A Stripe Checkout page for Pro on one listing: from the dashboard's upgrade and straight after the sign-up form.
 * A returning trader keeps their Stripe customer (and saved card); a new one is created by Checkout. Returns the page's
 * address, or null if Stripe didn't give one. Throws on a Stripe error, for the caller to log.
 * With `trialEnd` (the founding offer, lib/founding-data.ts) nothing is taken today: Stripe saves the card and takes the
 * first payment at the trial end, then renews until the trader cancels. The payment page says so above the button,
 * and a trial with no card is cancelled rather than left running.
 */
export async function proCheckoutUrl(
  cfg: StripeConfig,
  o: { providerId: string; email: string | null; plan: Plan; successPath: string; cancelPath: string; trialEnd?: number | null },
): Promise<string | null> {
  const price = o.plan === "annual" ? PRO_PRICE.annual : PRO_PRICE.monthly;
  const trial: Stripe.Checkout.SessionCreateParams.SubscriptionData = o.trialEnd
    ? {
        trial_end: o.trialEnd,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        metadata: { provider_id: o.providerId, founding: "1" },
      }
    : { metadata: { provider_id: o.providerId } };
  const { data: customer } = await createServiceClient().rpc("stripe_customer_for", { p_provider: o.providerId });
  const session = await stripeClient(cfg).checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: cfg.prices[o.plan], quantity: 1 }],
    client_reference_id: o.providerId,
    ...(typeof customer === "string" && customer ? { customer } : o.email ? { customer_email: o.email } : {}),
    metadata: { provider_id: o.providerId },
    subscription_data: trial,
    ...(o.trialEnd
      ? {
          payment_method_collection: "always" as const,
          custom_text: {
            submit: {
              message:
                `Founding offer: nothing to pay today. Pro is free until ${FOUNDING_UNTIL.label}. On ` +
                `${FOUNDING_FIRST_CHARGE.label} we'll take ${price}, and Pro renews until you cancel. Cancel any time ` +
                `before then from Manage billing on your dashboard and you won't be charged.`,
            },
          },
        }
      : {}),
    success_url: absoluteUrl(o.successPath),
    cancel_url: absoluteUrl(o.cancelPath),
  });
  return session.url;
}
