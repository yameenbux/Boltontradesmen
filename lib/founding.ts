// The founding offer, requested by the owner: the first FOUNDING_PLACES traders get Pro free until FOUNDING_UNTIL,
// switched on by the admin as a founding grant (migration 000035). The For traders page shows the places left from
// the real count (founding_places_taken, migration 000059), so it never claims a scarcity that isn't there.
// Client-safe.

export const FOUNDING_PLACES = 20;
/** The last day of founding Pro, as the admin's form date (yyyy-mm-dd) and as the page says it. */
export const FOUNDING_UNTIL = { iso: "2027-01-31", label: "31 January 2027" } as const;

/** Places still open, 0 to FOUNDING_PLACES; null (offer not shown) when the count couldn't be read. */
export function foundingPlacesLeft(taken: number | null): number | null {
  if (taken === null || !Number.isFinite(taken) || taken < 0) return null;
  return Math.max(0, FOUNDING_PLACES - Math.floor(taken));
}

/** "19 of 20 places left", "1 of 20 places left". */
export function placesLeftText(left: number): string {
  return `${left} of ${FOUNDING_PLACES} places left`;
}
