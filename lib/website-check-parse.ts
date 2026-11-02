import { z } from "zod";
import { CHECK_ERRORS, CHECK_FIELDS, CHECK_LIMITS, type CheckFormState, type WebsiteCheckRequest } from "@/lib/website-check";
import { InvalidPhoneError, toE164 } from "@/lib/phone";

// Server-side check of the free website check form (zod), sharing the limits and messages with the form.

const required = (max: number, message: string) => z.string().trim().min(1, message).max(max, message);

const schema = z.object({
  contact_name: required(CHECK_LIMITS.contact_name, CHECK_ERRORS.contact_name),
  business_name: required(CHECK_LIMITS.business_name, CHECK_ERRORS.business_name),
  trade: required(CHECK_LIMITS.trade, CHECK_ERRORS.trade),
  phone: z
    .string()
    .trim()
    .min(1, CHECK_ERRORS.phone)
    .max(CHECK_LIMITS.phone, CHECK_ERRORS.phone)
    .transform((v, ctx) => {
      try {
        return toE164(v);
      } catch (err) {
        if (!(err instanceof InvalidPhoneError)) throw err;
        ctx.addIssue({ code: "custom", message: CHECK_ERRORS.phone });
        return z.NEVER;
      }
    }),
  email: z
    .string()
    .trim()
    .max(CHECK_LIMITS.email, CHECK_ERRORS.email)
    .refine((v) => v === "" || z.email().safeParse(v).success, CHECK_ERRORS.email)
    .transform((v) => (v ? v.toLowerCase() : null)),
  link: z
    .string()
    .trim()
    .max(CHECK_LIMITS.link, CHECK_ERRORS.link)
    .transform((v) => v || null),
});

/** Checks the form's fields. Returns the cleaned request, or one message per field that's wrong. */
export function parseWebsiteCheck(
  fd: FormData,
): { ok: true; data: WebsiteCheckRequest } | { ok: false; errors: NonNullable<CheckFormState["errors"]> } {
  const raw: Record<string, string> = {};
  for (const k of CHECK_FIELDS) {
    const v = fd.get(k);
    raw[k] = typeof v === "string" ? v : "";
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: NonNullable<CheckFormState["errors"]> = {};
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
      contact_name: d.contact_name,
      business_name: d.business_name,
      trade: d.trade,
      phone_e164: d.phone,
      email: d.email,
      link: d.link,
    },
  };
}
