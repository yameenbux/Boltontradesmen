import { z } from "zod";
import {
  LISTING_ERRORS,
  LISTING_FIELDS,
  LISTING_LIMITS,
  type ListingFormState,
  type ListingRequest,
} from "@/lib/listing-request";
import { InvalidPhoneError, toE164 } from "@/lib/phone";

// Server-side check of the "Get listed" form (zod), sharing the limits and messages with the form.

const required = (max: number, message: string) => z.string().trim().min(1, message).max(max, message);
const optional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => v || null);

const schema = z.object({
  business_name: required(LISTING_LIMITS.business_name, LISTING_ERRORS.business_name),
  contact_name: required(LISTING_LIMITS.contact_name, LISTING_ERRORS.contact_name),
  trade: required(LISTING_LIMITS.trade, LISTING_ERRORS.trade),
  area: optional(LISTING_LIMITS.area, LISTING_ERRORS.area),
  phone: z
    .string()
    .trim()
    .min(1, LISTING_ERRORS.phone)
    .max(LISTING_LIMITS.phone, LISTING_ERRORS.phone)
    .transform((v, ctx) => {
      try {
        return toE164(v);
      } catch (err) {
        if (!(err instanceof InvalidPhoneError)) throw err;
        ctx.addIssue({ code: "custom", message: LISTING_ERRORS.phone });
        return z.NEVER;
      }
    }),
  email: z
    .string()
    .trim()
    .max(LISTING_LIMITS.email, LISTING_ERRORS.email)
    .refine((v) => v === "" || z.email().safeParse(v).success, LISTING_ERRORS.email)
    .transform((v) => (v ? v.toLowerCase() : null)),
  message: optional(LISTING_LIMITS.message, LISTING_ERRORS.message),
  permission: z.literal("yes", { error: LISTING_ERRORS.permission }),
});

/** Checks the form's fields. Returns the cleaned request, or one message per field that's wrong. */
export function parseListingRequest(
  fd: FormData,
): { ok: true; data: ListingRequest } | { ok: false; errors: NonNullable<ListingFormState["errors"]> } {
  const raw: Record<string, string> = {};
  for (const k of [...LISTING_FIELDS, "permission"]) {
    const v = fd.get(k);
    raw[k] = typeof v === "string" ? v : "";
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: NonNullable<ListingFormState["errors"]> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0] as keyof typeof errors;
      errors[k] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const d = parsed.data;
  return {
    ok: true,
    data: {
      business_name: d.business_name,
      contact_name: d.contact_name,
      trade: d.trade,
      area: d.area,
      phone_e164: d.phone,
      email: d.email,
      message: d.message,
    },
  };
}
