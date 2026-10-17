import "server-only";
import { stripeConfig } from "@/lib/pro";
import { stripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

// A listing that's withdrawn (by the trader) or removed (by the admin) shouldn't keep paying for Pro: its running
// subscriptions are set to cancel at the end of the period already paid for. Best effort: with Stripe not set up it
// does nothing, and any failure is logged while the withdrawal or removal goes ahead regardless. Stripe's
// customer.subscription.updated webhook then records the change.

/** Returns how many subscriptions were set to cancel. Never throws. */
export async function cancelProForListing(providerId: string): Promise<number> {
  const cfg = stripeConfig();
  if (!cfg) return 0;
  let ids: string[];
  try {
    const { data, error } = await createServiceClient().rpc("stripe_live_subscriptions", { p_provider: providerId });
    if (error) throw new Error(`stripe_live_subscriptions: ${error.message}`);
    ids = Array.isArray(data) ? (data as string[]) : [];
  } catch (err) {
    console.error("pro: finding the listing's subscriptions failed:", err instanceof Error ? err.message : err);
    return 0;
  }
  let done = 0;
  for (const id of ids) {
    try {
      await stripeClient(cfg).subscriptions.update(id, { cancel_at_period_end: true });
      done++;
    } catch (err) {
      console.error(`pro: setting ${id} to cancel at the period end failed:`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}
