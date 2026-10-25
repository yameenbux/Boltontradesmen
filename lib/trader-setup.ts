// The trader's one form, after they sign in on the trader side: their name (only if the account has none yet),
// business, the trades and postcode areas they tick, mobile and WhatsApp, Free or Pro, then Confirm. Client-safe:
// the form imports it. Nothing is charged here: Pro is paid for from the listing page, which goes live straight away.

export type Plan = "free" | "pro";

export const isPlan = (v: string): v is Plan => v === "free" || v === "pro";

/** At most this many trades per listing (the database's own limit: enforce_max_categories). */
export const MAX_TRADES = 3;

export type TraderSetupState = {
  errors?: Partial<
    Record<"first_name" | "surname" | "business_name" | "trades" | "areas" | "phone" | "whatsapp" | "plan", string>
  >;
  message?: string;
  /** What was sent, so a refused send keeps the form filled (trades and areas are lists). */
  values?: Record<string, string | string[]>;
};

/** The trader's own request, as my_listing_request returns it. */
export type MyListingRequest = {
  status: "new" | "done";
  business_name: string;
  phone_e164: string;
  plan: Plan;
  created_at: string;
};

export const TRADER_SETUP_ERRORS = {
  plan: "Choose Free or Pro. You can change your mind later.",
  trades: "Tick your trade.",
  too_many_trades: `Tick up to ${MAX_TRADES} trades.`,
  areas: "Tick the postcode areas you cover.",
  whatsapp: "Enter a mobile number for WhatsApp, like 07700 900123, or leave it empty.",
  whatsapp_landline: "WhatsApp needs a mobile number. Untick WhatsApp, or enter your WhatsApp mobile below.",
  duplicate: "This number is already on a listing. WhatsApp us on 07466 487591 and we'll sort it out.",
  not_allowed: "This account can't list a business. WhatsApp us on 07466 487591 and we'll sort it out.",
  already: "We've already got your details and they're being reviewed.",
} as const;
