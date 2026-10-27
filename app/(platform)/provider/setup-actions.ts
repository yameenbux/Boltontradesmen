"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { TRADER_START } from "@/lib/account-intent";
import { type AccountRow, signInPath, toAccount } from "@/lib/auth";
import { clientIpFrom } from "@/lib/client-ip";
import { CONSENT_TEXT_VERSION, consentStatement } from "@/lib/consent-text";
import { formatDisplayName, InvalidNameError } from "@/lib/display-name";
import { BL_DISTRICTS } from "@/lib/districts";
import { firstName } from "@/lib/initials";
import { ipHash } from "@/lib/ip-hash";
import { LISTING_ERRORS, LISTING_LIMITS } from "@/lib/listing-request";
import { platformPath } from "@/lib/paths";
import { InvalidPhoneError, toE164, toUkMobileE164 } from "@/lib/phone";
import { revalidatePublicPages } from "@/lib/revalidate-public";
import { createServerAuthClient } from "@/lib/supabase/server";
import { deliverLive } from "@/lib/notify";
import { isPlan as isProBilling, stripeConfig } from "@/lib/pro";
import { proCheckoutUrl } from "@/lib/pro-checkout";
import { logoFile, logoPath, prepareLogo, type PreparedLogo } from "@/lib/trader-logo";
import { PhotoError } from "@/lib/work-photos";
import { createServiceClient } from "@/lib/supabase/service";
import { CHECK_TRADES, isPlan, MAX_TRADES, TRADER_SETUP_ERRORS, type TraderSetupState } from "@/lib/trader-setup";

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
}

const list = (fd: FormData, name: string) =>
  [...new Set(fd.getAll(name).filter((v): v is string => typeof v === "string" && v.trim() !== ""))];

const FIELDS = ["first_name", "surname", "business_name", "phone", "whatsapp", "plan", "pro_billing"] as const;

/**
 * The trader's one form, in one step: their name (when the account has none yet), business, the trades and postcode
 * areas they tick, mobile and WhatsApp, Free or Pro, then Confirm. Confirm, under the listing statement, is their
 * agreement (recorded as the consent page records it), and the listing goes live at once, linked to the account,
 * with their logo if they chose one.
 * The admin checks it afterwards. Then the "you're now live" page, or, for Pro, Stripe's payment page first.
 */
export async function submitTraderSetup(_prev: TraderSetupState, fd: FormData): Promise<TraderSetupState> {
  const values: TraderSetupState["values"] = {};
  for (const k of FIELDS) values[k] = field(fd, k);
  values.whatsapp_same = field(fd, "whatsapp_same") === "yes" ? "yes" : "";
  const trades = list(fd, "trades");
  const areas = list(fd, "areas").filter((a) => BL_DISTRICTS.includes(a));
  values.trades = trades;
  values.areas = areas;
  for (const c of CHECK_TRADES) {
    values[`${c.kind}_ref`] = field(fd, `${c.kind}_ref`);
    values[`${c.kind}_expires`] = field(fd, `${c.kind}_expires`);
  }

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
      displayName = formatDisplayName(values.first_name as string, values.surname as string);
      contactName = `${values.first_name} ${values.surname}`.replace(/\s+/g, " ");
    } catch (err) {
      const msg = err instanceof InvalidNameError ? err.message : "Enter your first name and surname";
      if (/surname/i.test(msg)) errors.surname = msg;
      else errors.first_name = msg;
    }
  }
  const business = values.business_name as string;
  if (!business || business.length > LISTING_LIMITS.business_name) errors.business_name = LISTING_ERRORS.business_name;
  if (trades.length === 0) errors.trades = TRADER_SETUP_ERRORS.trades;
  else if (trades.length > MAX_TRADES) errors.trades = TRADER_SETUP_ERRORS.too_many_trades;
  if (areas.length === 0) errors.areas = TRADER_SETUP_ERRORS.areas;
  let phone = "";
  try {
    phone = toE164(values.phone as string);
  } catch (err) {
    if (!(err instanceof InvalidPhoneError)) throw err;
    errors.phone = LISTING_ERRORS.phone;
  }
  // WhatsApp: the mobile itself when they tick it, or another mobile they give, or none.
  let whatsapp: string | null = null;
  const other = values.whatsapp as string;
  if (other) {
    try {
      whatsapp = toUkMobileE164(other);
    } catch (err) {
      if (!(err instanceof InvalidPhoneError)) throw err;
      errors.whatsapp = TRADER_SETUP_ERRORS.whatsapp;
    }
  } else if (values.whatsapp_same === "yes" && phone) {
    try {
      whatsapp = toUkMobileE164(phone);
    } catch (err) {
      if (!(err instanceof InvalidPhoneError)) throw err;
      errors.whatsapp = TRADER_SETUP_ERRORS.whatsapp_landline;
    }
  }
  if (!isPlan(values.plan as string)) errors.plan = TRADER_SETUP_ERRORS.plan;
  // A ticked trade that needs a check comes with its number and expiry, for the admin to look up.
  const refs: Record<string, { ref: string; expires: string }> = {};
  for (const c of CHECK_TRADES) {
    if (!trades.includes(c.slug)) continue;
    const ref = (values[`${c.kind}_ref`] as string).replace(/\s+/g, "");
    const expires = values[`${c.kind}_expires`] as string;
    if (!/^[A-Za-z0-9]{4,12}$/.test(ref)) errors[c.kind] = TRADER_SETUP_ERRORS.check_ref;
    else if (!validExpiry(expires)) errors[c.kind] = TRADER_SETUP_ERRORS.check_expires;
    else refs[c.kind] = { ref, expires };
  }
  // Their logo (optional): checked and re-encoded now, so a bad file is refused on the form; stored once they're live.
  let logo: PreparedLogo | null = null;
  const logoIn = logoFile(fd);
  if (logoIn) {
    try {
      logo = await prepareLogo(new Uint8Array(await logoIn.arrayBuffer()));
    } catch (err) {
      if (!(err instanceof PhotoError)) throw err;
      errors.logo = err.message;
    }
  }
  // A refused send empties the file box (it can't be refilled), so say so when a good logo was chosen.
  if (Object.keys(errors).length) {
    if (logo) errors.logo = TRADER_SETUP_ERRORS.logo_again;
    return { errors, values };
  }

  const statement = consentStatement();
  if (!statement) {
    console.error("trader setup refused: OWNER_LEGAL_NAME and CONTACT_EMAIL must be set in production");
    return { message: LISTING_ERRORS.failed, values };
  }

  if (needsName) {
    const { data, error } = await supabase.rpc("complete_onboarding", {
      p_display_name: displayName,
      p_district: areas[0],
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

  const email = account?.email ?? auth.user.email ?? null;
  let result: { result?: string; slug?: string; id?: string } = {};
  try {
    const ip = clientIpFrom(await headers()) ?? "unknown";
    const { data, error } = await createServiceClient().rpc("trader_publish_listing", {
      p_user_id: auth.user.id,
      p_business_name: business,
      p_contact_name: contactName || "Trader",
      p_category_slugs: trades,
      p_areas: areas,
      p_phone_e164: phone,
      p_whatsapp_e164: whatsapp,
      p_email: email,
      p_plan: values.plan,
      p_ip_hash: ipHash(ip),
      p_refs: refs,
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
  if (result.result === "duplicate") return { errors: { phone: TRADER_SETUP_ERRORS.duplicate }, values };
  if (result.result === "not_allowed") return { message: TRADER_SETUP_ERRORS.not_allowed, values };
  if (result.result !== "ok") {
    console.error("trader setup: trader_publish_listing answered", result.result);
    return { message: LISTING_ERRORS.failed, values };
  }
  if (logo && result.id) await storeLogo(supabase, result.id, logo);
  // On the category and home pages now, not when their cache next runs out.
  revalidatePublicPages();
  if (email) {
    const pro = values.plan === "pro";
    after(() => deliverLive(email, { name: firstName(contactName) ?? "there", business, pro }));
  }
  // Chose Pro: straight to Stripe to pay. They're live on Free whatever happens there; paying switches Pro on (the
  // webhook), stopping leaves them on Free with Pro a tap away.
  const live = platformPath("provider", "live");
  const cfg = values.plan === "pro" ? stripeConfig() : null;
  if (cfg && result.id) {
    let url: string | null = null;
    try {
      url = await proCheckoutUrl(cfg, {
        providerId: result.id,
        email,
        plan: isProBilling(values.pro_billing) ? values.pro_billing : "monthly",
        successPath: `${live}?pro=success`,
        cancelPath: `${live}?pro=stopped`,
      });
    } catch (err) {
      console.error("trader setup: Stripe checkout failed:", err instanceof Error ? err.message : err);
    }
    if (url) redirect(url);
  }
  redirect(live);
}

// Stores the logo and puts it on the new listing. A failure here doesn't undo the listing: they're live, and can add
// it from the dashboard.
async function storeLogo(
  supabase: Awaited<ReturnType<typeof createServerAuthClient>>,
  providerId: string,
  logo: PreparedLogo,
): Promise<void> {
  try {
    const path = logoPath(providerId);
    const bucket = createServiceClient().storage.from("trader-logos");
    const { error: upErr } = await bucket.upload(path, logo.bytes, { contentType: logo.mime, upsert: false });
    if (upErr) throw new Error(`upload: ${upErr.message}`);
    const { error } = await supabase.rpc("set_my_logo", { p_provider: providerId, p_path: path });
    if (error) {
      await bucket.remove([path]);
      throw new Error(`set_my_logo: ${error.message}`);
    }
  } catch (err) {
    console.error("trader setup: storing the logo failed:", err instanceof Error ? err.message : err);
  }
}

// A yyyy-mm-dd date from today to six years ahead (cards and badges last up to five).
function validExpiry(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  const today = new Date().toISOString().slice(0, 10);
  const limit = new Date();
  limit.setUTCFullYear(limit.getUTCFullYear() + 6);
  return v >= today && v <= limit.toISOString().slice(0, 10);
}
