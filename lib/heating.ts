// The heating landing page (/boiler-repair-bolton), requested by the owner for the winter push: everyone listed for
// heating repair, gas and boilers, or plumbing, in one list. Pure, so it can be unit tested.
import type { PublicProvider } from "@/lib/directory";

export const HEATING_PATH = "/boiler-repair-bolton";
export const HEATING_TRADES = ["heating-repair", "gas-boilers", "plumber"] as const;

const time = (s: string | null) => (s ? Date.parse(s) : 0);

/**
 * The trades' lists merged, each listing once: ranked (3+ reviews) by score, then reviews, then the latest review,
 * as the trade pages order them; newcomers newest first. Nothing about payment is read, so Pro never moves anyone.
 */
export function mergeHeatingLists(lists: { ranked: PublicProvider[]; newcomers: PublicProvider[] }[]): {
  ranked: PublicProvider[];
  newcomers: PublicProvider[];
} {
  const byId = new Map<string, PublicProvider>();
  for (const l of lists) for (const p of [...l.ranked, ...l.newcomers]) byId.set(p.id, p);
  const all = [...byId.values()];
  const ranked = all
    .filter((p) => p.score !== null && p.reviewCount >= 3)
    .sort(
      (a, b) =>
        (b.score as number) - (a.score as number) ||
        b.reviewCount - a.reviewCount ||
        time(b.lastReviewAt) - time(a.lastReviewAt),
    );
  const newcomers = all.filter((p) => !(p.score !== null && p.reviewCount >= 3)).sort((a, b) => time(b.createdAt) - time(a.createdAt));
  return { ranked, newcomers };
}
