import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { platformPath } from "@/lib/paths";
import type { TradeDoc } from "@/lib/trade-docs";

/** The signed-in trader's listing for quotes and invoices (?listing=<id> or their first), with whether Pro is on. */
export async function myDocListing(next: string, wanted?: string) {
  const { supabase, account } = await requireMember(next);
  const listings = account.providers.filter((p) => p.status !== "removed");
  const listing = listings.find((p) => p.id === wanted) ?? listings[0];
  if (!listing) redirect(platformPath("provider"));
  const { data, error } = await supabase.rpc("my_pro_status", { p_provider: listing.id });
  if (error) throw new Error(`my_pro_status failed: ${error.message}`);
  return { supabase, listing, isPro: (data as { is_pro?: boolean } | null)?.is_pro === true };
}

/** One of the caller's quotes or invoices, or a 404. */
export async function myDoc(docId: string) {
  const path = platformPath("provider", "docs", docId);
  const { supabase } = await requireMember(path);
  if (!/^[0-9a-f-]{36}$/i.test(docId)) notFound();
  const { data, error } = await supabase.rpc("my_doc", { p_doc: docId });
  if (error) {
    if (error.message === "not_found" || error.message === "not_your_listing") notFound();
    throw new Error(`my_doc failed: ${error.message}`);
  }
  const d = data as { doc: TradeDoc; provider_id: string; business_name: string; slug: string };
  const { data: pro } = await supabase.rpc("my_pro_status", { p_provider: d.provider_id });
  return { supabase, ...d, isPro: (pro as { is_pro?: boolean } | null)?.is_pro === true };
}

/** A date n days from today in Bolton, as yyyy-mm-dd. */
export function londonDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
