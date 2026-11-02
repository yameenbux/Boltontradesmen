import "server-only";
import { FOUNDING_FIRST_CHARGE, foundingOpen, foundingPlacesLeft } from "@/lib/founding";
import { createServiceClient } from "@/lib/supabase/service";

/** How many founding places are taken (migration 000059), or null when it can't be read (the offer is then hidden). */
export async function foundingPlacesTaken(): Promise<number | null> {
  try {
    const { data, error } = await createServiceClient().rpc("founding_places_taken");
    if (error || typeof data !== "number") {
      if (error) console.error("founding: founding_places_taken failed:", error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.error("founding: could not read the places taken:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Whether the offer is open now with places left: what the sign-up form and the dashboard show. */
export async function foundingOffered(): Promise<boolean> {
  if (!foundingOpen()) return false;
  const left = foundingPlacesLeft(await foundingPlacesTaken());
  return left !== null && left > 0;
}

/**
 * The trial end (Unix seconds) for this listing's checkout, or null: the offer is open with places left, and the
 * listing has never had a Stripe subscription (a free trial is for new Pro traders, once).
 */
export async function foundingTrialEnd(providerId: string): Promise<number | null> {
  if (!(await foundingOffered())) return null;
  const { data: customer, error } = await createServiceClient().rpc("stripe_customer_for", { p_provider: providerId });
  if (error) {
    console.error("founding: stripe_customer_for failed:", error.message);
    return null;
  }
  if (typeof customer === "string" && customer) return null;
  return Math.floor(FOUNDING_FIRST_CHARGE.at.getTime() / 1000);
}
