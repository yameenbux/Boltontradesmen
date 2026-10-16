"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
import { AVAILABILITY_ERRORS, parseAvailabilityForm } from "@/lib/availability";
import { LISTING_ERRORS, parseListingEdit } from "@/lib/listing-edit";
import { platformPath } from "@/lib/paths";
import { ID_PATTERN, REPLY_MAX } from "@/lib/review-form";
import { revalidatePublicPages } from "@/lib/revalidate-public";

const REPLY_ERRORS: Record<string, { field?: "body"; message: string }> = {
  reply_empty: { field: "body", message: "Write your reply first." },
  reply_too_long: { field: "body", message: "Keep your reply to 400 characters." },
  reply_has_phone: { field: "body", message: "Please leave phone numbers out of your reply." },
  edit_window_closed: { message: "Replies can only be edited for 14 days after posting." },
  reply_removed: {
    message: "Your reply to this review was removed, so you can't post another. Contact us if you think that's wrong.",
  },
  not_your_listing: { message: "That review isn't on your listing." },
  review_not_found: { message: "That review is no longer on your page." },
  blocked: { message: "Your account can't post replies. Contact us if you think that's wrong." },
};

/** The provider's reply to a review of their own listing (posted at once; edits allowed for 14 days). */
export async function saveReply(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireMember(platformPath("provider"));
  const reviewId = typeof fd.get("review_id") === "string" ? (fd.get("review_id") as string) : "";
  const raw = typeof fd.get("body") === "string" ? (fd.get("body") as string) : "";
  const body = raw.trim();
  const values = { body: raw };
  const fail = (code: string): FormState => {
    const e = REPLY_ERRORS[code];
    if (!e) {
      console.error("provider: provider_reply failed:", code);
      return { message: "Something went wrong. Please try again.", values };
    }
    return e.field ? { errors: { [e.field]: e.message }, values } : { message: e.message, values };
  };
  if (!ID_PATTERN.test(reviewId)) return fail("");
  if (!body) return fail("reply_empty");
  if (body.length > REPLY_MAX) return fail("reply_too_long");

  const { data, error } = await supabase.rpc("provider_reply", { p_review: reviewId, p_body: body });
  if (error) return fail(error.message);
  revalidatePublicPages(typeof data === "string" ? data : undefined);
  revalidatePath(platformPath("provider"));
  return { ok: true, message: "Reply posted. It's on your page now.", values: { body } };
}

/** The trader's availability ("Taking on work", "Booked up until …" or nothing), for every listing they're linked to. */
export async function setMyAvailability(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireMember(platformPath("provider"));
  const values = Object.fromEntries(
    ["choice", "this_week", "until"].map((k) => [k, typeof fd.get(k) === "string" ? (fd.get(k) as string) : ""]),
  );
  const parsed = parseAvailabilityForm(fd);
  if (!parsed.ok) return { errors: { [parsed.field]: parsed.message }, values };

  const { data, error } = await supabase.rpc("set_my_availability", {
    p_status: parsed.choice.status,
    p_until: parsed.choice.until,
  });
  if (error) {
    const known = AVAILABILITY_ERRORS[error.message];
    if (!known) {
      console.error("provider: set_my_availability failed:", error.message);
      return { message: "Something went wrong. Please try again.", values };
    }
    return known.field ? { errors: { [known.field]: known.message }, values } : { message: known.message, values };
  }
  const slugs = Array.isArray(data) ? (data as string[]) : [];
  if (slugs.length === 0) revalidatePublicPages();
  for (const slug of slugs) revalidatePublicPages(slug);
  revalidatePath(platformPath("provider"));
  return {
    ok: true,
    message: parsed.choice.status ? "Saved. It's on your page now." : "Cleared. Your page doesn't show availability now.",
  };
}

// A listing error code as form state (field errors where there's a field), or a general failure for anything else.
function listingFail(code: string, values?: FormState["values"]): FormState {
  const known = LISTING_ERRORS[code];
  if (!known) {
    console.error("provider: listing change failed:", code);
    return { message: "Something went wrong. Please try again.", values };
  }
  return known.field ? { errors: { [known.field]: known.message }, values } : { message: known.message, values };
}

const providerIdFrom = (fd: FormData) => {
  const v = fd.get("provider_id");
  return typeof v === "string" && ID_PATTERN.test(v) ? v : null;
};

// Refreshes the listing's public pages (profile, lists, badges) and the trader's own page.
function refresh(slug: unknown) {
  revalidatePublicPages(typeof slug === "string" ? slug : undefined);
  revalidatePath(platformPath("provider"));
}

/** The trader's description and areas (categories stay with the admin). */
export async function saveMyListing(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireMember(platformPath("provider"));
  const values = {
    bio: typeof fd.get("bio") === "string" ? (fd.get("bio") as string) : "",
    areas: fd.getAll("areas").filter((v): v is string => typeof v === "string"),
  };
  const id = providerIdFrom(fd);
  if (!id) return listingFail("", values);
  const parsed = parseListingEdit(fd);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const { data, error } = await supabase.rpc("update_my_listing", {
    p_provider: id,
    p_bio: parsed.value.bio,
    p_areas: parsed.value.areas,
  });
  if (error) return listingFail(error.message, values);
  refresh(data);
  return {
    ok: true,
    message: "Saved. It's on your page now.",
    values: { bio: parsed.value.bio ?? "", areas: parsed.value.areas },
  };
}

type StatusRpc = "pause_my_listing" | "unpause_my_listing" | "withdraw_my_listing";

// Runs one of the trader's status changes; null when it worked, else the form state to show.
async function changeStatus(fd: FormData, rpc: StatusRpc): Promise<FormState | null> {
  const { supabase } = await requireMember(platformPath("provider"));
  const id = providerIdFrom(fd);
  if (!id) return listingFail("");
  const { data, error } = await supabase.rpc(rpc, { p_provider: id });
  if (error) return listingFail(error.message);
  refresh(data);
  return null;
}

/** Live -> paused: hidden from the lists and the profile, reviews kept. */
export async function pauseMyListing(_prev: FormState, fd: FormData): Promise<FormState> {
  return (await changeStatus(fd, "pause_my_listing")) ?? { ok: true, message: "Paused. Your page is hidden until you unpause it." };
}

/** Paused (by the trader) -> live. */
export async function unpauseMyListing(_prev: FormState, fd: FormData): Promise<FormState> {
  return (await changeStatus(fd, "unpause_my_listing")) ?? { ok: true, message: "Unpaused. Your page is back on Bolton Vouched." };
}

/** Withdraw: removed, as the admin's removal; only a new invite brings it back. Needs the confirm box ticked. */
export async function withdrawMyListing(_prev: FormState, fd: FormData): Promise<FormState> {
  if (fd.get("confirm") !== "on") {
    return { errors: { confirm: "Tick the box to confirm you want to withdraw your listing." } };
  }
  const failed = await changeStatus(fd, "withdraw_my_listing");
  if (failed) return failed;
  redirect(`${platformPath("provider")}?withdrawn=1`);
}
