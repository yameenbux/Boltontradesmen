"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { CHECK_KINDS, SETTABLE_STATUSES, type FormState } from "@/lib/admin-shared";
import { InvalidPhoneError, toE164 } from "@/lib/phone";
import { PLATFORM_BASE, platformPath } from "@/lib/paths";

// Public pages read providers from the database (home is prerendered), so status changes and
// edits must invalidate them for paused/removed providers to disappear immediately.
function revalidatePublicPages() {
  revalidatePath(`${PLATFORM_BASE}/p/[slug]`, "page");
  revalidatePath(`${PLATFORM_BASE}/c/[category]`, "page");
  revalidatePath(platformPath());
}

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
    return { message: "Could not change the status. Try again." };
  }
  revalidatePath(`/admin/providers/${v.provider_id}`);
  revalidatePath("/admin");
  revalidatePublicPages();
  return { ok: true, message: "Status updated" };
}

// Rotates the provider's consent token (invalidating any earlier link) and returns the new link.
export async function newConsentLink(providerId: string): Promise<{ url?: string; error?: string }> {
  const { supabase } = await requireAdmin();
  if (!z.string().uuid().safeParse(providerId).success) return { error: "Unknown provider" };
  const { data, error } = await supabase.rpc("admin_new_consent_token", { p_provider: providerId });
  if (error) return { error: "Could not create a consent link" };
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return { url: `${base}${platformPath("consent", data as string)}` };
}
