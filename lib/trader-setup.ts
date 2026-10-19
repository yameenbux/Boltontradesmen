// The trader's one form, after they sign in on the trader side: their name (only if the account has none yet),
// business, trade, area, mobile, and Free or Pro. Client-safe: the form imports it. Nothing is charged here: Pro is
// paid for from the listing page once the listing is approved.

export type Plan = "free" | "pro";

export const isPlan = (v: string): v is Plan => v === "free" || v === "pro";

export type TraderSetupState = {
  errors?: Partial<Record<"first_name" | "surname" | "business_name" | "trade" | "district" | "phone" | "plan" | "permission", string>>;
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
} as const;
