import { z } from "zod";
import { BL_DISTRICTS } from "@/lib/districts";
import { JOB_BODY_MIN, JOB_ERRORS, JOB_FIELDS, JOB_LIMITS, type JobFormState, type JobRequest } from "@/lib/job-request";
import { InvalidPhoneError, toE164 } from "@/lib/phone";

// Server-side check of the "Request a quote" form (zod), sharing the limits and messages with the form.

const squash = (v: string) => v.replace(/\s+/g, " ").trim();

const schema = z.object({
  name: z
    .string()
    .transform(squash)
    .pipe(z.string().min(2, JOB_ERRORS.name).max(JOB_LIMITS.name, JOB_ERRORS.name)),
  phone: z
    .string()
    .trim()
    .min(1, JOB_ERRORS.phone)
    .max(JOB_LIMITS.phone, JOB_ERRORS.phone)
    .transform((v, ctx) => {
      try {
        return toE164(v);
      } catch (err) {
        if (!(err instanceof InvalidPhoneError)) throw err;
        ctx.addIssue({ code: "custom", message: JOB_ERRORS.phone });
        return z.NEVER;
      }
    }),
  email: z
    .string()
    .trim()
    .max(JOB_LIMITS.email, JOB_ERRORS.email)
    .refine((v) => v === "" || z.email().safeParse(v).success, JOB_ERRORS.email)
    .transform((v) => (v ? v.toLowerCase() : null)),
  district: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => BL_DISTRICTS.includes(v), JOB_ERRORS.district),
  // Line breaks are kept (people list jobs); runs of spaces aren't.
  body: z
    .string()
    .transform((v) => v.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim())
    .pipe(z.string().min(JOB_BODY_MIN, JOB_ERRORS.body).max(JOB_LIMITS.body, JOB_ERRORS.body)),
});

/** Checks the form's fields. Returns the cleaned request, or one message per field that's wrong. */
export function parseJobRequest(
  fd: FormData,
): { ok: true; data: JobRequest } | { ok: false; errors: NonNullable<JobFormState["errors"]> } {
  const raw: Record<string, string> = {};
  for (const k of JOB_FIELDS) {
    const v = fd.get(k);
    raw[k] = typeof v === "string" ? v : "";
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: NonNullable<JobFormState["errors"]> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0] as keyof typeof errors;
      errors[k] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const d = parsed.data;
  return { ok: true, data: { name: d.name, phone_e164: d.phone, email: d.email, district: d.district, body: d.body } };
}
