"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { CHECK_KINDS, SETTABLE_STATUSES, type FormState } from "@/lib/admin-shared";
import { InvalidPhoneError, toE164 } from "@/lib/phone";
import { platformPath } from "@/lib/paths";
import { dayMonthYear } from "@/lib/checks";
// Public pages read providers from the database (home is prerendered), so status changes and
// edits must invalidate them for paused/removed providers to disappear immediately.
import { revalidatePublicPages } from "@/lib/revalidate-public";

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
    .transform((v) => v.split(/[\s,]+/).map((a) => a.toUpperCase()).filter(Boolean))
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
  const values = Object.fromEntries(Object.entries(raw).filter(([, x]) => x !== undefined)) as Record<string, string | string[]>;
  const parsed = providerSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const v = parsed.data;

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
    if (error.message.includes("max 3 categories")) return { errors: { category_ids: "Choose at most 3 categories" }, values };
    const req = /category requires (\w+) check/.exec(error.message);
    if (req) {
      return { errors: { category_ids: `A category needs an in-date ${req[1]} check first. Save the provider, record the check, then add the category.` }, values };
    }
    return { message: "Could not save the provider. Try again.", values };
  }
  revalidatePath("/admin");
  revalidatePublicPages();
  redirect(`/admin/providers/${data as string}`);
}

const checkSchema = z.object({
  provider_id: z.string().uuid(),
  kind: z.enum(CHECK_KINDS.map(([k]) => k) as [string, ...string[]]),
  reference: z.string().max(200),
  expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").or(z.literal("")),
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
    if (error.message.includes("expiry required")) return { errors: { expires_on: "This kind of check needs an expiry date" } };
    return { message: "Could not record the check. Try again." };
  }
  revalidatePath(`/admin/providers/${v.provider_id}`);
  revalidatePublicPages();
  return { ok: true, message: "Check recorded" };
}

const statusSchema = z.object({
  provider_id: z.string().uuid(),
  status: z.enum(SETTABLE_STATUSES),
  reason: z.string().max(500),
}).refine((v) => v.status !== "removed" || v.reason.length > 0, { path: ["reason"], message: "Enter a reason for removing this provider" });

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
    if (error.message.includes("reason is required")) return { errors: { reason: "Enter a reason for removing this provider" } };
    if (error.message.includes("only return through a new invite")) {
      return { errors: { status: "A removed provider can only come back through Re-invite" } };
    }
    return { message: "Could not change the status. Try again." };
  }
  revalidatePath(`/admin/providers/${v.provider_id}`);
  revalidatePath("/admin");
  revalidatePublicPages();
  return { ok: true, message: "Status updated" };
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
    if (error.message.includes("only a removed provider")) return { message: "Only a removed provider can be re-invited." };
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
