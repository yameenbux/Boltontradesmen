import { platformPath } from "@/lib/paths";
import { DEFAULT_NEXT } from "@/lib/safe-next";

// One account works for both: anyone can look, ask and review, and an account becomes a trader's once a listing is
// linked to it. The sign-in page's "I need a trader / I'm a trader" switch only decides where someone lands: a trader
// goes to the trader start (one form, or their listing) instead of the directory.

/** Where a trader's journey starts: their listing, or (with none linked yet) the one form to get listed. */
export const TRADER_START = platformPath("provider");

/** The sign-in for a trader: same methods, lands on the trader start. */
export const TRADER_SIGN_IN = `${platformPath("sign-in")}?next=${encodeURIComponent(TRADER_START)}`;

/** The switch shows only when the sign-in had no particular destination (a review, a trader link, a question). */
export function asksIntent(next: string): boolean {
  return next === DEFAULT_NEXT || next === platformPath("account");
}
