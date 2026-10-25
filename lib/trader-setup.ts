// The trader's one form, after they sign in on the trader side: their name (only if the account has none yet),
// business, trade, area, mobile, Free or Pro, and their agreement to the listing statement. Client-safe: the form
// imports it. Nothing is charged here: Pro is paid for from the listing page, which goes live straight away.

export type Plan = "free" | "pro";

export const isPlan = (v: string): v is Plan => v === "free" || v === "pro";

export type TraderSetupState = {
  errors?: Partial<Record<"first_name" | "surname" | "business_name" | "trade" | "district" | "phone" | "plan" | "permission" | "agree", string>>;
  message?: string;
  values?: Record<string, string>;
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
  district: "Choose the area you're based in",
  already: "We've already got your details and they're being reviewed.",
  agree: "Tick to agree to the terms and privacy notice, so we can put your listing live.",
  not_allowed: "This account can't list a business. WhatsApp us and we'll sort it out.",
} as const;
