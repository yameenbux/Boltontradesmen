// "How did you hear about Bolton Vouched?" on the trader sign-up form (providers.heard_from, migration 000057).
// Client-safe; the list matches the database's check.

export const HEARD_FROM = [
  { value: "facebook", label: "Facebook" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "word_of_mouth", label: "Someone told me" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "other", label: "Somewhere else" },
] as const;

export type HeardFrom = (typeof HEARD_FROM)[number]["value"];

export const isHeardFrom = (v: string): v is HeardFrom => HEARD_FROM.some((h) => h.value === v);

export const HEARD_FROM_LABEL = Object.fromEntries(HEARD_FROM.map((h) => [h.value, h.label])) as Record<HeardFrom, string>;
