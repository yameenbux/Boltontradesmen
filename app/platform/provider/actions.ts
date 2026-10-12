"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
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
