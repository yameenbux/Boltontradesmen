"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ID_PATTERN } from "@/lib/review-form";
import { requireAdmin } from "@/lib/admin";
import { duplicateMessage, listingForPhone } from "@/lib/listing-duplicates";
import { CHECK_KINDS, SETTABLE_STATUSES, type FormState } from "@/lib/admin-shared";
import { AVAILABILITY_ERRORS, parseAvailabilityForm } from "@/lib/availability";
import { InvalidPhoneError, toE164 } from "@/lib/phone";
import { platformPath } from "@/lib/paths";
import { cancelProForListing } from "@/lib/pro-cancel";
import { dayMonthYear } from "@/lib/checks";
// Public pages read providers from the database (home is prerendered), so status changes and
// edits must invalidate them for paused/removed providers to disappear immediately.
import { revalidatePublicPages } from "@/lib/revalidate-public";
import { deliverNumberChanged } from "@/lib/notify";
import { CONTACT_EMAIL } from "@/components/site/content";

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

const phoneField = (required: boolean) =>
  z.string().transform((v, ctx) => {
    if (!v) {
      if (required) ctx.addIssue({ code: "custom", message: "Enter a phone number" });
      return required ? v : null;
    }
    try {
      return toE164(v);
    } catch (e) {
      if (!(e instanceof InvalidPhoneError)) throw e;
      ctx.addIssue({ code: "custom", message: "Enter a valid UK phone number" });
      return v;
    }
  });

const providerSchema = z.object({
  id: z.string().uuid().optional(),
  business_name: z.string().min(1, "Enter the business name").max(120),
  contact_name: z.string().max(120),
  phone: phoneField(true),
  whatsapp: phoneField(false),
  areas: z
    .string()
    .transform((v) =>
      v
        .split(/[\s,]+/)
        .map((a) => a.toUpperCase())
        .filter(Boolean),
    )
    .refine((a) => a.every((d) => /^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(d)), "Use postcode districts like BL1, BL2"),
  bio: z.string().max(1000, "Keep the bio under 1000 characters"),
  category_ids: z.array(z.string().uuid()).max(3, "Choose at most 3 categories"),
});

export async function saveProvider(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const raw = {
    id: text(formData.get("id")) || undefined,
    business_name: text(formData.get("business_name")),
    contact_name: text(formData.get("contact_name")),
    phone: text(formData.get("phone")),
    whatsapp: text(formData.get("whatsapp")),
    areas: text(formData.get("areas")),
    bio: text(formData.get("bio")),
    category_ids: formData.getAll("category_ids").filter((v): v is string => typeof v === "string"),
  };
  const values = Object.fromEntries(Object.entries(raw).filter(([, x]) => x !== undefined)) as Record<
    string,
    string | string[]
  >;
  const parsed = providerSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const v = parsed.data;

  // One listing per number (migration 000034): say which listing already has it, before the database refuses.
  let existing;
  try {
    existing = v.phone ? await listingForPhone(v.phone, v.id) : null;
  } catch (err) {
    console.error("admin: duplicate number check failed:", err);
    return { message: "Could not save the provider. Try again.", values };
  }
  const duplicate = duplicateMessage(existing, !v.id);
  if (duplicate) return { errors: { phone: duplicate }, values };

  // Before saving: the number customers reach them on now, and who to tell if it changes.
  let before = null as { phone_e164?: string; owner_email?: string | null } | null;
  if (v.id) {
    const { data: b } = await supabase.rpc("admin_get_provider", { p_id: v.id });
    before = b as typeof before;
  }

  const { data, error } = await supabase.rpc("admin_upsert_provider", {
    p: {
      id: v.id,
      business_name: v.business_name,
      contact_name: v.contact_name,
      phone_e164: v.phone,
      whatsapp_e164: v.whatsapp,
      areas: v.areas,
      bio: v.bio,
      category_ids: v.category_ids,
    },
  });
  if (error) {
    if (error.message.includes("providers_one_listing_per_phone")) {
      return { errors: { phone: "This number is already on another listing. Open that listing instead." }, values };
    }
    if (error.message.includes("max 3 categories"))
      return { errors: { category_ids: "Choose at most 3 categories" }, values };
    const req = /category requires (\w+) check/.exec(error.message);
    if (req) {
      return {
        errors: {
          category_ids: `A category needs an in-date ${req[1]} check first. Save the provider, record the check, then add the category.`,
        },
        values,
      };
    }
    return { message: "Could not save the provider. Try again.", values };
  }
  // A new provider made from a "Get listed" request: that request is dealt with, so mark it done. Failing here
  // never undoes the save; the admin can still mark the request by hand.
  const fromRequest = text(formData.get("from_request"));
  if (!v.id && fromRequest && ID_PATTERN.test(fromRequest)) {
    const { error: reqError } = await supabase.rpc("admin_set_listing_request_status", {
      p_id: fromRequest,
      p_status: "done",
    });
    if (reqError) console.error("admin: marking listing request done failed:", reqError.message);
    revalidatePath("/admin/requests");
  }
  // The admin's edits are silent, except a new number: calls would go somewhere the trader doesn't expect, so tell
  // the account it's linked to. Best effort, after the response.
  const to = before?.owner_email;
  const phone = v.phone;
  if (to && phone && before?.phone_e164 && before.phone_e164 !== phone) {
    const business = v.business_name;
    after(() => deliverNumberChanged(to, business, phone, CONTACT_EMAIL));
  }
  revalidatePath("/admin");
  revalidatePublicPages();
  redirect(`/admin/providers/${data as string}`);
}

const checkSchema = z.object({
  provider_id: z.string().uuid(),
  kind: z.enum(CHECK_KINDS.map(([k]) => k) as [string, ...string[]]),
  reference: z.string().max(200),
  expires_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .or(z.literal("")),
});

export async function recordCheck(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const parsed = checkSchema.safeParse({
    provider_id: text(formData.get("provider_id")),
    kind: text(formData.get("kind")),
    reference: text(formData.get("reference")),
    expires_on: text(formData.get("expires_on")),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const { error } = await supabase.rpc("admin_record_check", {
    p_provider: v.provider_id,
    p_kind: v.kind,
    p_reference: v.reference,
    p_expires_on: v.expires_on || null,
  });
  if (error) {
    if (error.message.includes("expiry required"))
      return { errors: { expires_on: "This kind of check needs an expiry date" } };
    return { message: "Could not record the check. Try again." };
  }
  revalidatePath(`/admin/providers/${v.provider_id}`);
  revalidatePublicPages();
  return { ok: true, message: "Check recorded" };
}

const statusSchema = z
  .object({
    provider_id: z.string().uuid(),
    status: z.enum(SETTABLE_STATUSES),
    reason: z.string().max(500),
  })
  .refine((v) => v.status !== "removed" || v.reason.length > 0, {
    path: ["reason"],
    message: "Enter a reason for removing this provider",
  });

export async function setStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const parsed = statusSchema.safeParse({
    provider_id: text(formData.get("provider_id")),
    status: text(formData.get("status")),
    reason: text(formData.get("reason")),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const { error } = await supabase.rpc("admin_set_provider_status", {
    p_id: v.provider_id,
    p_status: v.status,
    p_reason: v.reason,
  });
  if (error) {
    if (error.message.includes("providers_live_requires_consent") || error.message.includes("can only go live")) {
      return { errors: { status: "A provider can only go live after giving consent (and not once removed)" } };
    }
    if (error.message.includes("reason is required"))
      return { errors: { reason: "Enter a reason for removing this provider" } };
    if (error.message.includes("only return through a new invite")) {
      return { errors: { status: "A removed provider can only come back through Re-invite" } };
    }
    return { message: "Could not change the status. Try again." };
  }
  // A removed listing's Pro stops at the end of the period paid for (best effort; never blocks the removal).
  const cancelled = v.status === "removed" ? await cancelProForListing(v.provider_id) : 0;
  revalidatePath(`/admin/providers/${v.provider_id}`);
  revalidatePath("/admin");
  revalidatePublicPages();
  return {
    ok: true,
    message: cancelled > 0 ? "Status updated. Their Pro is set to cancel at the end of the period paid for." : "Status updated",
  };
}

function consentUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return `${base}${platformPath("consent", token)}`;
}

// Reads the expiry of the provider's current consent token, as "26 October 2026".
async function consentExpiry(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], providerId: string) {
  const { data } = await supabase.rpc("admin_get_provider", { p_id: providerId });
  return dayMonthYear((data as { consent_token_expires_at?: string } | null)?.consent_token_expires_at) ?? undefined;
}

// Rotates the provider's consent token (invalidating any earlier link) and returns the new link and its expiry.
export async function newConsentLink(providerId: string): Promise<{ url?: string; expires?: string; error?: string }> {
  const { supabase } = await requireAdmin();
  if (!z.string().uuid().safeParse(providerId).success) return { error: "Unknown provider" };
  const { data, error } = await supabase.rpc("admin_new_consent_token", { p_provider: providerId });
  if (error) return { error: "Could not create a consent link" };
  return { url: consentUrl(data as string), expires: await consentExpiry(supabase, providerId) };
}

const reinviteSchema = z.object({
  provider_id: z.string().uuid(),
  reason: z.string().min(1, "Enter a reason for re-inviting this provider").max(500),
});

// Brings a removed provider back to invited with a fresh consent link. They must consent again before going live.
export async function reinviteProvider(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const parsed = reinviteSchema.safeParse({ provider_id: text(fd.get("provider_id")), reason: text(fd.get("reason")) });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: { reason: text(fd.get("reason")) } };
  const v = parsed.data;
  const { data, error } = await supabase.rpc("admin_reinvite_provider", { p_id: v.provider_id, p_reason: v.reason });
  if (error) {
    if (error.message.includes("only a removed provider"))
      return { message: "Only a removed provider can be re-invited." };
    return { message: "Could not re-invite the provider. Try again.", values: { reason: v.reason } };
  }
  revalidatePath(`/admin/providers/${v.provider_id}`);
  revalidatePath("/admin");
  revalidatePublicPages();
  const expires = await consentExpiry(supabase, v.provider_id);
  return {
    ok: true,
    message: "Re-invited. Send them the new consent link: they need to agree again before going live.",
    values: { consent_url: consentUrl(data as string), ...(expires ? { consent_expires: expires } : {}) },
  };
}

// ---- availability: "Taking on work", "Booked up until …" or nothing, for any listing that isn't removed.

export async function setProviderAvailability(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const providerId = text(fd.get("provider_id"));
  const values = { choice: text(fd.get("choice")), this_week: text(fd.get("this_week")), until: text(fd.get("until")) };
  if (!z.guid().safeParse(providerId).success) return { message: "Unknown provider", values };
  const parsed = parseAvailabilityForm(fd);
  if (!parsed.ok) return { errors: { [parsed.field]: parsed.message }, values };
  const { data, error } = await supabase.rpc("admin_set_availability", {
    p_provider: providerId,
    p_status: parsed.choice.status,
    p_until: parsed.choice.until,
  });
  if (error) {
    const known = Object.entries(AVAILABILITY_ERRORS).find(([k]) => error.message.includes(k))?.[1];
    if (!known) {
      console.error("admin: admin_set_availability failed:", error.message);
      return { message: "Could not save the availability. Try again.", values };
    }
    return known.field ? { errors: { [known.field]: known.message }, values } : { message: known.message, values };
  }
  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePublicPages(typeof data === "string" ? data : undefined);
  return { ok: true, message: parsed.choice.status ? "Availability saved" : "Availability cleared" };
}

// ---- trader sign-in links (Plan 2b): a single-use link that links the signed-in account opening it to the listing.
// z.guid(): any 8-4-4-4-12 hex id (the E2E fixtures' ids are not RFC version-4 uuids).

const TRADER_LINK_ADMIN_ERRORS: Record<string, string> = {
  listing_already_linked: "This listing is already linked to an account. Unlink it first.",
  "provider not linkable": "A trader link is only available once the provider has agreed to be listed.",
};

function traderLinkUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return `${base}${platformPath("link", token)}`;
}

// Makes a new trader sign-in link (any earlier unused one stops working) and returns it with its expiry.
export async function newTraderLink(providerId: string): Promise<{ url?: string; expires?: string; error?: string }> {
  const { supabase } = await requireAdmin();
  if (!z.guid().safeParse(providerId).success) return { error: "Unknown provider" };
  const { data, error } = await supabase.rpc("admin_new_trader_link", { p_provider: providerId });
  if (error) {
    const known = Object.entries(TRADER_LINK_ADMIN_ERRORS).find(([k]) => error.message.includes(k));
    if (!known) console.error("admin: admin_new_trader_link failed:", error.message);
    return { error: known?.[1] ?? "Could not create a trader link. Try again." };
  }
  const link = data as { token: string; expires_at: string };
  revalidatePath(`/admin/providers/${providerId}`);
  return { url: traderLinkUrl(link.token), expires: dayMonthYear(link.expires_at) ?? undefined };
}

const unlinkSchema = z.object({
  provider_id: z.guid(),
  reason: z.string().min(1, "Enter a reason. It's kept in the audit log.").max(500),
});

// Unlinks the account from the listing (for example when the wrong person opened a forwarded link).
export async function unlinkProviderAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const parsed = unlinkSchema.safeParse({ provider_id: text(fd.get("provider_id")), reason: text(fd.get("reason")) });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: { reason: text(fd.get("reason")) } };
  const v = parsed.data;
  const { error } = await supabase.rpc("admin_unlink_provider", { p_provider: v.provider_id, p_reason: v.reason });
  if (error) {
    if (error.message.includes("provider not linked")) return { message: "This listing isn't linked to an account." };
    console.error("admin: admin_unlink_provider failed:", error.message);
    return { message: "Could not unlink the account. Try again.", values: { reason: v.reason } };
  }
  revalidatePath(`/admin/providers/${v.provider_id}`);
  return { ok: true, message: "Unlinked. You can now make a new trader sign-in link." };
}

// ---- founding Pro (000035): Pro switched on without Stripe, until a date.

const GRANT_ERRORS: Record<string, string> = {
  bad_date: "Choose a date from today up to two years ahead.",
  note_too_long: "Keep the note to 200 characters.",
};

export async function grantFoundingPro(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const providerId = text(fd.get("provider_id"));
  const values = { until: text(fd.get("until")), note: text(fd.get("note")) };
  if (!z.guid().safeParse(providerId).success) return { message: "Unknown provider", values };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.until)) return { errors: { until: GRANT_ERRORS.bad_date }, values };
  const { data, error } = await supabase.rpc("admin_grant_pro", {
    p_provider: providerId,
    p_until: values.until,
    p_note: values.note.trim() || null,
  });
  if (error) {
    const known = Object.entries(GRANT_ERRORS).find(([k]) => error.message.includes(k));
    if (!known) {
      console.error("admin: admin_grant_pro failed:", error.message);
      return { message: "Could not switch Pro on. Try again.", values };
    }
    return known[0] === "bad_date" ? { errors: { until: known[1] }, values } : { errors: { note: known[1] }, values };
  }
  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePublicPages(typeof data === "string" ? data : undefined);
  return { ok: true, message: "Founding Pro is on" };
}

export async function endFoundingPro(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const providerId = text(fd.get("provider_id"));
  if (!z.guid().safeParse(providerId).success) return { message: "Unknown provider" };
  const { data, error } = await supabase.rpc("admin_revoke_pro_grant", { p_provider: providerId });
  if (error) {
    console.error("admin: admin_revoke_pro_grant failed:", error.message);
    return { message: "Could not end founding Pro. Try again." };
  }
  revalidatePath(`/admin/providers/${providerId}`);
  revalidatePublicPages(typeof data === "string" ? data : undefined);
  return { ok: true, message: "Founding Pro ended" };
}

// Clears "New, check me" on a listing that went live from a trader's own sign-up.
export async function markReviewed(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const id = text(fd.get("provider_id"));
  if (!z.string().uuid().safeParse(id).success) return { message: "Unknown provider" };
  const { error } = await supabase.rpc("admin_mark_provider_reviewed", { p_id: id });
  if (error) return { message: "Could not mark it checked. Try again." };
  revalidatePath(`/admin/providers/${id}`);
  revalidatePath("/admin");
  return { ok: true };
}
