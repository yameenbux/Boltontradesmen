import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// One listing per phone number (migration 000034 makes the database refuse a second one unless the first is removed).
// These look the existing listing up so the admin sees which one it is, and is pointed at it instead.

export type ExistingListing = { id: string; business_name: string; status: string };

const rank = (status: string) => (status === "removed" ? 1 : 0);

/** The listing that already has this number (one that isn't removed first), ignoring `exceptId`. */
export async function listingForPhone(phone: string, exceptId?: string): Promise<ExistingListing | null> {
  let q = createServiceClient().from("providers").select("id, business_name, status").eq("phone_e164", phone);
  if (exceptId) q = q.neq("id", exceptId);
  const { data, error } = await q;
  if (error) throw new Error(`listingForPhone: ${error.message}`);
  const rows = (data ?? []) as ExistingListing[];
  return rows.sort((a, b) => rank(a.status) - rank(b.status))[0] ?? null;
}

/** For each of these numbers, the listing that already has it (if any). */
export async function listingsForPhones(phones: string[]): Promise<Map<string, ExistingListing>> {
  const out = new Map<string, ExistingListing>();
  const unique = [...new Set(phones)];
  if (unique.length === 0) return out;
  const { data, error } = await createServiceClient()
    .from("providers")
    .select("id, business_name, status, phone_e164")
    .in("phone_e164", unique);
  if (error) throw new Error(`listingsForPhones: ${error.message}`);
  for (const row of (data ?? []) as (ExistingListing & { phone_e164: string })[]) {
    const seen = out.get(row.phone_e164);
    if (!seen || rank(row.status) < rank(seen.status)) {
      out.set(row.phone_e164, { id: row.id, business_name: row.business_name, status: row.status });
    }
  }
  return out;
}

/** The admin form's message when a number is taken (null when this save may go ahead). */
export function duplicateMessage(existing: ExistingListing | null, isNew: boolean): string | null {
  if (!existing) return null;
  if (existing.status === "removed") {
    // Editing a listing onto a removed listing's number is allowed (the database only guards active listings).
    if (!isNew) return null;
    return `This number belongs to a removed listing, ${existing.business_name}. Open it and use Reinvite to bring it back with its reviews.`;
  }
  return `This number is already on ${existing.business_name}. Open that listing instead of adding a second one.`;
}
