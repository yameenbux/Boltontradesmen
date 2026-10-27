// The dashboard's card payment state (my_card_payments, migration 000054), made safe to render. Client-safe.
export type CardState = { connected: boolean; chargesEnabled: boolean; detailsSubmitted: boolean };

export function toCardState(raw: unknown): CardState {
  const o = (raw ?? {}) as Record<string, unknown>;
  return { connected: o.connected === true, chargesEnabled: o.charges_enabled === true, detailsSubmitted: o.details_submitted === true };
}
