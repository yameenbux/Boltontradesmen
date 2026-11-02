// The founding offer, requested by the owner: the first FOUNDING_PLACES traders get Pro free until FOUNDING_UNTIL, as a
// Stripe trial. They add a card at checkout; on FOUNDING_FIRST_CHARGE Stripe takes the first payment and Pro renews
// until they cancel (it's theirs to cancel, and every place the offer appears says so). The admin can still switch
// Pro on without Stripe (a founding grant, migration 000035); both take a place. The For traders page shows the
// places left from the real count (founding_places_taken, migration 000059), so it never claims a scarcity that isn't
// there. Client-safe.
import { PRO_PRICE } from "@/lib/pro-features";

export const FOUNDING_PLACES = 20;
/** The last free day, as the admin's form date (yyyy-mm-dd) and as the pages say it. */
export const FOUNDING_UNTIL = { iso: "2027-01-31", label: "31 January 2027" } as const;
/** When Stripe takes the first payment: the start of 1 February 2027 in Bolton (GMT in winter). */
export const FOUNDING_FIRST_CHARGE = { at: new Date("2027-02-01T00:00:00Z"), label: "1 February 2027" } as const;

/** The offer, in one sentence, wherever a trader can take it up. */
export const FOUNDING_TERMS =
  `Free until ${FOUNDING_UNTIL.label}, then ${PRO_PRICE.monthly} (or ${PRO_PRICE.annual}) from ` +
  `${FOUNDING_FIRST_CHARGE.label} until you cancel. You add a card to start; cancel before ${FOUNDING_FIRST_CHARGE.label} ` +
  "and you pay nothing.";

/** Whether the offer can still be taken up: before the first charge date (Stripe needs the trial end 2 days ahead). */
export function foundingOpen(now: Date = new Date()): boolean {
  return FOUNDING_FIRST_CHARGE.at.getTime() - now.getTime() > 2 * 86_400_000;
}

/** Places still open, 0 to FOUNDING_PLACES; null (offer not shown) when the count couldn't be read. */
export function foundingPlacesLeft(taken: number | null): number | null {
  if (taken === null || !Number.isFinite(taken) || taken < 0) return null;
  return Math.max(0, FOUNDING_PLACES - Math.floor(taken));
}

/** "19 of 20 places left", "1 of 20 places left". */
export function placesLeftText(left: number): string {
  return `${left} of ${FOUNDING_PLACES} places left`;
}
