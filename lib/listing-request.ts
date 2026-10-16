// The "Get listed" form (/get-listed): its fields, limits and messages. Client-safe and light (no zod, no phone
// library): the form imports it. The server checks with lib/listing-request-parse.ts; the database
// (submit_listing_request) checks the same limits again.

export const LISTING_LIMITS = {
  business_name: 80,
  contact_name: 60,
  trade: 60,
  area: 60,
  phone: 20,
  email: 254,
  message: 500,
} as const;

/** Submissions faster than this after the page loaded are treated as a script's (pretend success, store nothing). */
export const MIN_FILL_MS = 3000;
/** The hidden honeypot field. People never see it; scripts that fill every field do. */
export const HONEYPOT_FIELD = "website";
/** The hidden field holding when the form was shown (signed by the server: lib/form-timing.ts). */
export const STARTED_FIELD = "started";

export const THANKS_PATH = "/get-listed/thanks";

export const LISTING_FIELDS = ["business_name", "contact_name", "trade", "area", "phone", "email", "message"] as const;

export type ListingRequest = {
  business_name: string;
  contact_name: string;
  trade: string;
  area: string | null;
  phone_e164: string;
  email: string | null;
  message: string | null;
};

export type ListingFormState = {
  errors?: Partial<Record<keyof typeof LISTING_LIMITS | "permission", string>>;
  message?: string;
  values?: Record<string, string>;
};

export const LISTING_ERRORS = {
  business_name: "Enter your business name, in up to 80 characters.",
  contact_name: "Enter your name, in up to 60 characters.",
  trade: "Enter your trade, in up to 60 characters.",
  area: "Keep the area to 60 characters.",
  phone: "Enter a mobile or landline number in the UK, like 07700 900123.",
  email: "Enter an email address like name@example.com, or leave it empty.",
  message: "Keep your message to 500 characters.",
  permission: "Tick the box to say you're the owner or have their permission.",
  captcha: "We couldn't check you're not a robot. Please try again.",
  limited:
    "We've already had a few requests from you or this number. We'll be in touch; if it's urgent, WhatsApp us on 07466 487591.",
  failed: "Something went wrong. Please try again, or WhatsApp us on 07466 487591.",
} as const;
