import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import { toPriceGuide, type PriceGuide } from "@/lib/price-guides";

// Published price guides, read through price_guide_public with the cookie-free client so the pages stay static (ISR).
// The view only returns trades at or above the threshold; toPriceGuide checks it again.

/** Every published guide, by trade name. */
export const listPriceGuides = cache(async (): Promise<PriceGuide[]> => {
  const { data, error } = await createPublicClient().from("price_guide_public").select("*").order("category_name");
  if (error) throw new Error(`listPriceGuides: ${error.message}`);
  return (data ?? []).map(toPriceGuide).filter((g): g is PriceGuide => g !== null);
});

/** One trade's guide; null when it isn't published (too few reviews, or no such trade). */
export const getPriceGuide = cache(async (slug: string): Promise<PriceGuide | null> => {
  const { data, error } = await createPublicClient()
    .from("price_guide_public")
    .select("*")
    .eq("category_slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getPriceGuide: ${error.message}`);
  return data ? toPriceGuide(data) : null;
});
