"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
import { isBrandColor } from "@/lib/brand";
import { platformPath } from "@/lib/paths";
import { PRO_ERRORS } from "@/lib/pro";
import { ID_PATTERN } from "@/lib/review-form";
import { revalidatePublicPages } from "@/lib/revalidate-public";
import { createServiceClient } from "@/lib/supabase/service";
import { logoFile, logoPath, prepareLogo } from "@/lib/trader-logo";
import { PhotoError } from "@/lib/work-photos";

// The trader's logo and (Pro) cover colour, from the dashboard. The database checks the listing is theirs (and Pro for
// the colour); the file is re-encoded and stored by this server, and the old one deleted once it's replaced.

const SOMETHING_WRONG = "Something went wrong. Please try again.";
const SLUG = /^[a-z0-9-]{1,80}$/;

function field(fd: FormData, name: string): string | null {
  const v = fd.get(name);
  return typeof v === "string" ? v : null;
}

function fail(code: string, where: string): FormState {
  const known = PRO_ERRORS[code];
  if (!known) console.error(`provider: ${where} failed:`, code);
  return { message: known ?? SOMETHING_WRONG };
}

function refresh(slug: string | null) {
  revalidatePublicPages(slug && SLUG.test(slug) ? slug : undefined);
  revalidatePath(platformPath("provider"));
}

async function deleteFile(path: string | null) {
  if (!path) return;
  const { error } = await createServiceClient().storage.from("trader-logos").remove([path]);
  if (error) console.error("provider: deleting an old logo failed:", error.message);
}

/** Adds or replaces the logo. */
export async function saveLogo(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = field(fd, "provider_id");
  if (!id || !ID_PATTERN.test(id)) return { message: SOMETHING_WRONG };
  const file = logoFile(fd);
  if (!file) return { errors: { logo: "Choose an image first." } };
  const { supabase } = await requireMember(platformPath("provider"));

  let logo;
  try {
    logo = await prepareLogo(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof PhotoError) return { errors: { logo: err.message } };
    throw err;
  }
  const path = logoPath(id);
  const bucket = createServiceClient().storage.from("trader-logos");
  const { error: upErr } = await bucket.upload(path, logo.bytes, { contentType: logo.mime, upsert: false });
  if (upErr) {
    console.error("provider: logo upload failed:", upErr.message);
    return { message: SOMETHING_WRONG };
  }
  const { data: old, error } = await supabase.rpc("set_my_logo", { p_provider: id, p_path: path });
  if (error) {
    await bucket.remove([path]);
    return fail(error.message, "set_my_logo");
  }
  await deleteFile(typeof old === "string" ? old : null);
  refresh(field(fd, "slug"));
  return { ok: true, message: "Your logo is on your page." };
}

/** Takes the logo off the page (initials show instead) and deletes the file. */
export async function removeLogo(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = field(fd, "provider_id");
  if (!id || !ID_PATTERN.test(id)) return { message: SOMETHING_WRONG };
  const { supabase } = await requireMember(platformPath("provider"));
  const { data: old, error } = await supabase.rpc("set_my_logo", { p_provider: id, p_path: null });
  if (error) return fail(error.message, "set_my_logo");
  await deleteFile(typeof old === "string" ? old : null);
  refresh(field(fd, "slug"));
  return { ok: true, message: "Your logo is off your page." };
}

/** The Pro cover colour, or none. */
export async function saveBrandColor(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = field(fd, "provider_id");
  if (!id || !ID_PATTERN.test(id)) return { message: SOMETHING_WRONG };
  const raw = field(fd, "brand_color") ?? "";
  if (raw !== "" && !isBrandColor(raw)) return { errors: { brand_color: "Choose one of the colours." } };
  const { supabase } = await requireMember(platformPath("provider"));
  const { error } = await supabase.rpc("set_my_brand_color", { p_provider: id, p_color: raw === "" ? null : raw });
  if (error) return fail(error.message, "set_my_brand_color");
  refresh(field(fd, "slug"));
  return { ok: true, message: raw === "" ? "Your cover is off." : "Your cover colour is saved." };
}
