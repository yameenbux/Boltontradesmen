"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TRADER_START } from "@/lib/account-intent";
import { type AccountRow, signInPath, toAccount } from "@/lib/auth";
import { clientIpFrom } from "@/lib/client-ip";
import { formatDisplayName, InvalidNameError } from "@/lib/display-name";
import { isDistrictChoice, OTHER_DISTRICT } from "@/lib/districts";
import { ipHash } from "@/lib/ip-hash";
import { LISTING_ERRORS } from "@/lib/listing-request";
import { parseListingRequest } from "@/lib/listing-request-parse";
import { createServerAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isPlan, TRADER_SETUP_ERRORS, type TraderSetupState } from "@/lib/trader-setup";

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

const FIELDS = ["first_name", "surname", "business_name", "trade", "district", "phone", "plan"] as const;

/**
 * The trader's one form: saves their name and area on the account (when it has none yet) and sends the listing
 * request, tied to the account, with the plan they picked. Then back to the trader start, which shows "sent for
 * review". The request is checked as the public form's is (zod, then the database's limits).
 */
export async function submitTraderSetup(_prev: TraderSetupState, fd: FormData): Promise<TraderSetupState> {
  const values: Record<string, string> = {};
  for (const k of FIELDS) values[k] = field(fd, k);
  if (field(fd, "permission") === "yes") values.permission = "yes";

  const supabase = await createServerAuthClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(signInPath(TRADER_START));
  const { data: row, error: accountError } = await supabase.rpc("my_account");
  if (accountError) throw new Error(`my_account failed: ${accountError.message}`);
  const account = toAccount(row as AccountRow | null);
  if (account?.deleted) redirect(signInPath(TRADER_START));
  const needsName = !account?.displayName;

  const errors: NonNullable<TraderSetupState["errors"]> = {};
  let displayName = account?.displayName ?? "";
  let contactName = displayName;
  if (needsName) {
    try {
      displayName = formatDisplayName(values.first_name, values.surname);
      contactName = `${values.first_name.trim()} ${values.surname.trim()}`.replace(/\s+/g, " ");
    } catch (err) {
      const msg = err instanceof InvalidNameError ? err.message : "Enter your first name and surname";
      if (/surname/i.test(msg)) errors.surname = msg;
      else errors.first_name = msg;
    }
  }
  if (!isDistrictChoice(values.district)) errors.district = TRADER_SETUP_ERRORS.district;
  if (!isPlan(values.plan)) errors.plan = TRADER_SETUP_ERRORS.plan;

  // The listing request's own checks, on the same fields the public form sends.
  const request = new FormData();
  request.set("business_name", values.business_name);
  request.set("contact_name", contactName || "Trader");
  request.set("trade", values.trade);
  request.set("area", values.district === OTHER_DISTRICT ? "Outside Bolton" : values.district);
  request.set("phone", values.phone);
  request.set("email", account?.email ?? auth.user.email ?? "");
  request.set("message", "");
  request.set("permission", values.permission ?? "");
  const parsed = parseListingRequest(request);
  if (!parsed.ok) {
    const e = parsed.errors;
    if (e.business_name) errors.business_name = e.business_name;
    if (e.trade) errors.trade = e.trade;
    if (e.phone) errors.phone = e.phone;
    if (e.permission) errors.permission = e.permission;
  }
  if (Object.keys(errors).length || !parsed.ok) return { errors, values };

  if (needsName) {
    const { data, error } = await supabase.rpc("complete_onboarding", {
      p_display_name: displayName,
      p_district: values.district,
      p_group_code: "",
    });
    const refused = (data as { error?: unknown } | null)?.error;
    if (error || refused) {
      if (error?.code === "23514" && /display_name/.test(error.message)) {
        return { errors: { first_name: "Use letters only in your name, please." }, values };
      }
      console.error("trader setup: complete_onboarding failed:", error?.message ?? refused);
      return { message: LISTING_ERRORS.failed, values };
    }
  }

  let verdict = "";
  try {
    const r = parsed.data;
    const ip = clientIpFrom(await headers()) ?? "unknown";
    const { data, error } = await createServiceClient().rpc("submit_listing_request", {
      p_business_name: r.business_name,
      p_contact_name: r.contact_name,
      p_trade: r.trade,
      p_area: r.area,
      p_phone_e164: r.phone_e164,
      p_email: r.email,
      p_message: null,
      p_ip_hash: ipHash(ip),
      p_user_id: auth.user.id,
      p_plan: values.plan,
    });
    if (error) throw new Error(`submit_listing_request: ${error.message}`);
    verdict = typeof data === "string" ? data : "";
  } catch (err) {
    console.error("trader setup: saving the request failed:", err);
    return { message: LISTING_ERRORS.failed, values };
  }
  if (verdict === "limited") return { message: LISTING_ERRORS.limited, values };
  if (verdict !== "ok" && verdict !== "already") {
    console.error("trader setup: submit_listing_request answered", verdict);
    return { message: LISTING_ERRORS.failed, values };
  }
  redirect(TRADER_START);
}
