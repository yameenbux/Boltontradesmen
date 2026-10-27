"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
import { platformPath } from "@/lib/paths";
import { DOCUMENT_KINDS, isPlan, PRO_ERRORS, stripeConfig, toProStatus, type DocumentKind } from "@/lib/pro";
import { ProofError, prepareProof, uploadProof } from "@/lib/proofs";
import { ID_PATTERN } from "@/lib/review-form";
import { revalidatePublicPages } from "@/lib/revalidate-public";
import { onboardingUrl } from "@/lib/card-payments";
import { proCheckoutUrl } from "@/lib/pro-checkout";
import { absoluteUrl } from "@/lib/seo";
import { stripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { PhotoError, prepareWorkPhoto, workPhotoPath } from "@/lib/work-photos";

// The trader's Pro: paying (Stripe Checkout and the billing portal), sending ID documents, and the work photos.
// Every write goes through a database function that checks the caller owns the listing (and, for adding, that Pro is
// on); files are stored by this server with the service role, after being re-encoded without metadata.

const SOMETHING_WRONG = "Something went wrong. Please try again.";

const providerIdFrom = (fd: FormData) => {
  const v = fd.get("provider_id");
  return typeof v === "string" && ID_PATTERN.test(v) ? v : null;
};

function proFail(code: string, where: string): FormState {
  const known = PRO_ERRORS[code];
  if (!known) console.error(`provider: ${where} failed:`, code);
  return { message: known ?? SOMETHING_WRONG };
}

// The caller's Pro for this listing (my_pro_status checks it's theirs), or the form state to show.
async function myPro(fd: FormData) {
  const { supabase, account } = await requireMember(platformPath("provider"));
  const id = providerIdFrom(fd);
  if (!id) return { fail: { message: SOMETHING_WRONG } as FormState };
  const { data, error } = await supabase.rpc("my_pro_status", { p_provider: id });
  if (error) return { fail: proFail(error.message, "my_pro_status") };
  return { supabase, account, id, pro: toProStatus(data) };
}

function refresh(slug?: unknown) {
  if (typeof slug === "string") revalidatePublicPages(slug);
  revalidatePath(platformPath("provider"));
}

/** Upgrade: a Stripe Checkout session for the chosen plan, then off to Stripe's page. */
export async function startProCheckout(_prev: FormState, fd: FormData): Promise<FormState> {
  const cfg = stripeConfig();
  if (!cfg) return { message: "Pro opens soon. Nothing has been charged." };
  const plan = fd.get("plan");
  if (!isPlan(plan)) return { errors: { plan: "Choose monthly or yearly." } };
  const r = await myPro(fd);
  if ("fail" in r) return r.fail as FormState;
  if (r.pro.isPro) return { message: "Pro is already on for this listing." };

  let url: string | null;
  try {
    url = await proCheckoutUrl(cfg, {
      providerId: r.id,
      email: r.account.email,
      plan,
      successPath: `${platformPath("provider")}?pro=success`,
      cancelPath: platformPath("provider"),
    });
  } catch (err) {
    console.error("provider: Stripe checkout failed:", err instanceof Error ? err.message : err);
    return { message: SOMETHING_WRONG };
  }
  if (!url) return { message: SOMETHING_WRONG };
  redirect(url);
}

/** Manage billing: Stripe's customer portal (change card, switch plan, cancel, invoices). */
export async function openBillingPortal(_prev: FormState, fd: FormData): Promise<FormState> {
  const cfg = stripeConfig();
  if (!cfg) return { message: "Billing can't be opened just now. Email us and we'll help." };
  const r = await myPro(fd);
  if ("fail" in r) return r.fail as FormState;
  let url: string;
  try {
    const { data: customer, error } = await createServiceClient().rpc("stripe_customer_for", { p_provider: r.id });
    if (error) throw new Error(`stripe_customer_for: ${error.message}`);
    if (typeof customer !== "string" || !customer) return { message: "There's no billing set up for this listing yet." };
    const session = await stripeClient(cfg).billingPortal.sessions.create({
      customer,
      return_url: absoluteUrl(platformPath("provider")),
    });
    url = session.url;
  } catch (err) {
    console.error("provider: Stripe billing portal failed:", err instanceof Error ? err.message : err);
    return { message: SOMETHING_WRONG };
  }
  redirect(url);
}

const isKind = (v: unknown): v is DocumentKind => DOCUMENT_KINDS.some(([k]) => k === v);

/** Sends a document for the ID check (stored privately, only the admin sees it, deleted 30 days after the decision). */
export async function sendProDocument(_prev: FormState, fd: FormData): Promise<FormState> {
  const kind = fd.get("kind");
  const file = fd.get("file");
  if (!isKind(kind)) return { errors: { kind: "Choose what the document is." } };
  if (!(file instanceof File) || file.size === 0) return { errors: { file: "Choose a photo or PDF of it." } };
  const r = await myPro(fd);
  if ("fail" in r) return r.fail as FormState;
  if (!r.pro.isPro) return proFail("not_pro", "sendProDocument");

  const service = createServiceClient();
  const bucket = service.storage.from("pro-id");
  let path: string;
  try {
    const doc = await prepareProof(new Uint8Array(await file.arrayBuffer()));
    path = await uploadProof(r.id, doc, bucket);
    const { error } = await r.supabase.rpc("add_my_pro_document", {
      p_provider: r.id,
      p_kind: kind,
      p_path: path,
      p_mime: doc.mime,
    });
    if (error) {
      await bucket.remove([path]);
      return proFail(error.message, "add_my_pro_document");
    }
  } catch (err) {
    if (err instanceof ProofError) return { errors: { file: err.message } };
    console.error("provider: document upload failed:", err instanceof Error ? err.message : err);
    return { message: SOMETHING_WRONG };
  }
  refresh();
  return {
    ok: true,
    message:
      kind === "photo_id"
        ? "Sent. We'll check your ID and let you know here, usually within two working days."
        : "Sent. We'll check it and record it on your page.",
  };
}

/** Adds a work photo (Pro only, up to 6). */
export async function addWorkPhoto(_prev: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { errors: { photo: "Choose a photo first." } };
  const r = await myPro(fd);
  if ("fail" in r) return r.fail as FormState;
  if (!r.pro.isPro) return proFail("not_pro", "addWorkPhoto");

  const bucket = createServiceClient().storage.from("work-photos");
  let slug: unknown;
  try {
    const photo = await prepareWorkPhoto(new Uint8Array(await file.arrayBuffer()));
    const path = workPhotoPath(r.id);
    const { error: upErr } = await bucket.upload(path, photo.bytes, {
      contentType: photo.mime,
      upsert: false,
      cacheControl: "31536000",
    });
    if (upErr) throw new Error(`work photo upload failed: ${upErr.message}`);
    const { data, error } = await r.supabase.rpc("add_my_work_photo", {
      p_provider: r.id,
      p_path: path,
      p_width: photo.width,
      p_height: photo.height,
    });
    if (error) {
      await bucket.remove([path]);
      return proFail(error.message, "add_my_work_photo");
    }
    slug = data;
  } catch (err) {
    if (err instanceof PhotoError) return { errors: { photo: err.message } };
    console.error("provider: photo upload failed:", err instanceof Error ? err.message : err);
    return { message: SOMETHING_WRONG };
  }
  refresh(slug);
  return { ok: true, message: "Added. It's on your page now." };
}

/** Takes a photo off the page and deletes the file (allowed with or without Pro). */
export async function removeWorkPhoto(_prev: FormState, fd: FormData): Promise<FormState> {
  const photoId = fd.get("photo_id");
  if (typeof photoId !== "string" || !ID_PATTERN.test(photoId)) return { message: SOMETHING_WRONG };
  const r = await myPro(fd);
  if ("fail" in r) return r.fail as FormState;
  const { data, error } = await r.supabase.rpc("remove_my_work_photo", { p_provider: r.id, p_photo: photoId });
  if (error) return proFail(error.message, "remove_my_work_photo");
  const out = (data ?? {}) as { slug?: unknown; path?: unknown };
  if (typeof out.path === "string") {
    const { error: rmErr } = await createServiceClient().storage.from("work-photos").remove([out.path]);
    if (rmErr) console.error("provider: deleting a removed photo's file failed:", rmErr.message);
  }
  refresh(out.slug);
  return { ok: true, message: "Removed." };
}

/** Moves a photo one place earlier or later. */
export async function moveWorkPhoto(_prev: FormState, fd: FormData): Promise<FormState> {
  const photoId = fd.get("photo_id");
  const dir = fd.get("direction");
  if (typeof photoId !== "string" || (dir !== "earlier" && dir !== "later")) return { message: SOMETHING_WRONG };
  const r = await myPro(fd);
  if ("fail" in r) return r.fail as FormState;
  const ids = r.pro.photos.map((p) => p.id);
  const i = ids.indexOf(photoId);
  const j = dir === "earlier" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const { data, error } = await r.supabase.rpc("reorder_my_work_photos", { p_provider: r.id, p_ids: ids });
  if (error) return proFail(error.message, "reorder_my_work_photos");
  refresh(data);
  return { ok: true, message: "Moved." };
}

/**
 * Card payments: connects the trader's own Stripe account (made the first time) and sends them to Stripe to finish
 * setting it up. Pro only. Stripe brings them back to the dashboard.
 */
export async function startCardPayments(_prev: FormState, fd: FormData): Promise<FormState> {
  const cfg = stripeConfig();
  if (!cfg) return { message: "Card payments open soon." };
  const r = await myPro(fd);
  if ("fail" in r) return r.fail as FormState;
  if (!r.pro.isPro) return { message: "Card payments come with Pro." };
  const slug = r.account.providers.find((p) => p.id === r.id)?.slug;
  if (!slug) return { message: SOMETHING_WRONG };
  let url: string;
  try {
    url = await onboardingUrl(cfg, { providerId: r.id, email: r.account.email, slug });
  } catch (err) {
    console.error("provider: card payments onboarding failed:", err instanceof Error ? err.message : err);
    return { message: SOMETHING_WRONG };
  }
  redirect(url);
}
