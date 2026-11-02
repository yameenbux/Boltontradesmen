"use server";

import { headers } from "next/headers";
import { CONTACT_EMAIL } from "@/components/site/content";
import { clientIpFrom } from "@/lib/client-ip";
import { filledTooFast } from "@/lib/form-timing";
import { ipHash } from "@/lib/ip-hash";
import { HONEYPOT_FIELD, STARTED_FIELD } from "@/lib/listing-request";
import { sendEmail } from "@/lib/notify";
import { rateAllow } from "@/lib/rate-limit";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";
import { CHECK_DONE, CHECK_ERRORS, CHECK_FIELDS, type CheckFormState, websiteCheckEmail } from "@/lib/website-check";
import { parseWebsiteCheck } from "@/lib/website-check-parse";

// The free website check. Public and cookie-free like the Get listed form: nothing is stored, the request is emailed
// to us. Spam checks, cheapest first: the honeypot and the fill time (a script is thanked and nothing is sent), the
// fields (zod), Cloudflare Turnstile (skipped when not configured), then 3 requests per connection a day.

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

export async function requestWebsiteCheck(_prev: CheckFormState, fd: FormData): Promise<CheckFormState> {
  if (field(fd, HONEYPOT_FIELD).trim() || filledTooFast(field(fd, STARTED_FIELD))) return { ok: true, message: CHECK_DONE };

  const values: Record<string, string> = {};
  for (const k of CHECK_FIELDS) values[k] = field(fd, k);

  const parsed = parseWebsiteCheck(fd);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const ip = clientIpFrom(await headers()) ?? "unknown";
  const human = await verifyTurnstile(field(fd, TURNSTILE_FIELD), ip);
  if (!human.ok) {
    const message = human.reason === "missing" || human.reason === "rejected" ? CHECK_ERRORS.captcha : CHECK_ERRORS.failed;
    return { message, values };
  }
  if (!(await rateAllow("website-check", ipHash(ip), 3, 86_400, false))) return { message: CHECK_ERRORS.limited, values };

  const sent = await sendEmail(CONTACT_EMAIL, websiteCheckEmail(parsed.data));
  if (!sent.ok) {
    console.error("website-check: email not sent:", sent.reason);
    return { message: CHECK_ERRORS.failed, values };
  }
  return { ok: true, message: CHECK_DONE };
}
