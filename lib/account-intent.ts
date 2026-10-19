import { platformPath } from "@/lib/paths";
import { DEFAULT_NEXT } from "@/lib/safe-next";

// One account works for both: anyone can look, ask and review, and an account becomes a trader's once a listing is
// linked to it. So the welcome step doesn't create a different kind of account; it asks what someone came for and
// sends a trader to the trader start (their listing, or how to get one) instead of the directory.

export type Intent = "customer" | "trader";

/** Where a trader's journey starts: their listing, or (with none linked yet) how to get listed or linked. */
export const TRADER_START = platformPath("provider");

/** The sign-in for a trader: same methods, lands on the trader start. */
export const TRADER_SIGN_IN = `${platformPath("sign-in")}?next=${encodeURIComponent(TRADER_START)}`;

/** Ask only when the sign-in had no particular destination (a review, a trader link, a question already says why). */
export function asksIntent(next: string): boolean {
  return next === DEFAULT_NEXT || next === platformPath("account");
}

export function isIntent(v: string): v is Intent {
  return v === "customer" || v === "trader";
}

/** Where the welcome step goes next. */
export function afterWelcome(next: string, intent: Intent | null): string {
  return intent === "trader" && asksIntent(next) ? TRADER_START : next;
}
