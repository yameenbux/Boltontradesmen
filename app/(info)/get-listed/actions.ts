"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIpFrom } from "@/lib/client-ip";
import { filledTooFast } from "@/lib/form-timing";
import { ipHash } from "@/lib/ip-hash";
import {
  HONEYPOT_FIELD,
  LISTING_ERRORS,
  LISTING_FIELDS,
  STARTED_FIELD,
  THANKS_PATH,
  type ListingFormState,
} from "@/lib/listing-request";
import { parseListingRequest } from "@/lib/listing-request-parse";
import { createServiceClient } from "@/lib/supabase/service";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";

// The public "Get listed" form. The page is public, so this never touches cookies: no auth client, only the service
// client (no session). Spam checks, cheapest first: the honeypot and the fill time (a script gets the thank-you page
// and nothing is stored), then the fields (zod), Cloudflare Turnstile (skipped when not configured), then the
// database's limits per connection, per number and per day.

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

export async function requestListing(_prev: ListingFormState, fd: FormData): Promise<ListingFormState> {
  if (field(fd, HONEYPOT_FIELD).trim() || filledTooFast(field(fd, STARTED_FIELD))) redirect(THANKS_PATH);

  const values: Record<string, string> = {};
  for (const k of LISTING_FIELDS) values[k] = field(fd, k);
  if (field(fd, "permission") === "yes") values.permission = "yes";

  const parsed = parseListingRequest(fd);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const ip = clientIpFrom(await headers()) ?? "unknown";
  const human = await verifyTurnstile(field(fd, TURNSTILE_FIELD), ip);
  if (!human.ok) {
    const message = human.reason === "missing" || human.reason === "rejected" ? LISTING_ERRORS.captcha : LISTING_ERRORS.failed;
    return { message, values };
  }

  let verdict: string;
  try {
    const r = parsed.data;
    const { data, error } = await createServiceClient().rpc("submit_listing_request", {
      p_business_name: r.business_name,
      p_contact_name: r.contact_name,
      p_trade: r.trade,
      p_area: r.area,
      p_phone_e164: r.phone_e164,
      p_email: r.email,
      p_message: r.message,
      p_ip_hash: ipHash(ip),
    });
    if (error) throw new Error(`submit_listing_request: ${error.message}`);
    verdict = typeof data === "string" ? data : "";
  } catch (err) {
    console.error("get-listed: saving the request failed:", err);
    return { message: LISTING_ERRORS.failed, values };
  }
  if (verdict === "limited") return { message: LISTING_ERRORS.limited, values };
  if (verdict !== "ok") {
    // The database refused what zod accepted: the two sets of rules have drifted apart.
    console.error("get-listed: submit_listing_request answered", verdict);
    return { message: LISTING_ERRORS.failed, values };
  }
  redirect(THANKS_PATH);
}
