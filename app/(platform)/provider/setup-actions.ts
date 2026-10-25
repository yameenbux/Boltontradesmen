"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { TRADER_START } from "@/lib/account-intent";
import { type AccountRow, signInPath, toAccount } from "@/lib/auth";
import { clientIpFrom } from "@/lib/client-ip";
import { CONSENT_TEXT_VERSION, consentStatement } from "@/lib/consent-text";
import { listCategoryGroups } from "@/lib/directory";
import { formatDisplayName, InvalidNameError } from "@/lib/display-name";
import { isDistrictChoice, OTHER_DISTRICT } from "@/lib/districts";
import { firstName } from "@/lib/initials";
import { ipHash } from "@/lib/ip-hash";
import { LISTING_ERRORS } from "@/lib/listing-request";
import { parseListingRequest } from "@/lib/listing-request-parse";
import { revalidatePublicPages } from "@/lib/revalidate-public";
import { createServerAuthClient } from "@/lib/supabase/server";
import { deliverLive } from "@/lib/notify";
import { createServiceClient } from "@/lib/supabase/service";
import { guessTrade } from "@/lib/trade-words";
import { isPlan, TRADER_SETUP_ERRORS, type TraderSetupState } from "@/lib/trader-setup";

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

const FIELDS = ["first_name", "surname", "business_name", "trade", "district", "phone", "plan"] as const;

/**
 * The trader's one form: saves their name and area on the account (when it has none yet) and puts their listing
 * live, linked to the account, with the plan they picked and their agreement to the statement they were shown
 * (recorded as the consent page records it). Checked as the public form's request is (zod, then the database's
 * limits); the admin reviews the listing afterwards. Then to their listing page, with Pro on offer if they chose it.
 */
export async function submitTraderSetup(_prev: TraderSetupState, fd: FormData): Promise<TraderSetupState> {
  const values: Record<string, string> = {};
  for (const k of FIELDS) values[k] = field(fd, k);
  if (field(fd, "permission") === "yes") values.permission = "yes";
  if (field(fd, "agree") === "yes") values.agree = "yes";

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
  if (values.agree !== "yes") errors.agree = TRADER_SETUP_ERRORS.agree;

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

  const statement = consentStatement();
  if (!statement) {
    console.error("trader setup refused: OWNER_LEGAL_NAME and CONTACT_EMAIL must be set in production");
    return { message: LISTING_ERRORS.failed, values };
  }

  let result: { result?: string; slug?: string } = {};
  const r = parsed.data;
  try {
    const ip = clientIpFrom(await headers()) ?? "unknown";
    const { data, error } = await createServiceClient().rpc("trader_publish_listing", {
      p_user_id: auth.user.id,
      p_business_name: r.business_name,
      p_contact_name: r.contact_name,
      p_trade: r.trade,
      p_category_slug: await tradeCategory(r.trade),
      p_area: values.district === OTHER_DISTRICT ? null : values.district,
      p_phone_e164: r.phone_e164,
      p_email: r.email,
      p_plan: values.plan,
      p_ip_hash: ipHash(ip),
      p_evidence: {
        ip,
        text_version: CONSENT_TEXT_VERSION,
        text_sha256: statement.sha256,
        owner_legal_name: statement.owner,
        contact_email: statement.contact,
      },
    });
    if (error) throw new Error(`trader_publish_listing: ${error.message}`);
    result = (data ?? {}) as typeof result;
  } catch (err) {
    console.error("trader setup: publishing the listing failed:", err);
    return { message: LISTING_ERRORS.failed, values };
  }
  if (result.result === "limited") return { message: LISTING_ERRORS.limited, values };
  if (result.result === "already") redirect(TRADER_START);
  if (result.result === "not_allowed") return { message: TRADER_SETUP_ERRORS.not_allowed, values };
  if (result.result !== "ok") {
    console.error("trader setup: trader_publish_listing answered", result.result);
    return { message: LISTING_ERRORS.failed, values };
  }
  // On the category and home pages now, not when their cache next runs out.
  revalidatePublicPages();
  if (r.email) {
    const email = r.email;
    const pro = values.plan === "pro";
    after(() => deliverLive(email, { name: firstName(contactName) ?? "there", business: r.business_name, pro }));
  }
  redirect(`${TRADER_START}?live=1${values.plan === "pro" ? "#pro" : ""}`);
}

// The category the trader's typed trade names: the exact name they picked from the suggestions, or the one its
// words point to ("sparky" is an electrician). None found, the listing goes live without one and the admin adds it.
async function tradeCategory(trade: string): Promise<string | null> {
  try {
    const categories = (await listCategoryGroups()).flatMap((g) => g.categories);
    const t = trade.trim().toLowerCase();
    return (categories.find((c) => c.name.toLowerCase() === t) ?? guessTrade(trade, categories))?.slug ?? null;
  } catch (err) {
    console.error("trader setup: could not match the trade:", err);
    return null;
  }
}
