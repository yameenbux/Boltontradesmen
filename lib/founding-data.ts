import "server-only";
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
