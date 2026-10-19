"use server";

import { requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
import { platformPath } from "@/lib/paths";
import { ID_PATTERN } from "@/lib/review-form";
import { CONTACT_EMAIL } from "@/components/site/content";

const REPORT_THANKS = "Thanks. We'll look at this review. Reports don't change a review on their own.";
const NOTE_NEEDED = "Tell us what's wrong with it, in up to 500 characters.";

const REPORT_ERRORS: Record<string, string> = {
  already_reported: "You've already reported this review. We'll look at it.",
  review_not_found: "That review isn't on the site any more.",
  report_limit: `You've sent 10 reports today, which is the most we take from one person in a day. Please try again tomorrow, or email ${CONTACT_EMAIL}.`,
};

/** A signed-in person's report: it creates a flag for the admin and never changes the review by itself. */
export async function reportReview(_prev: FormState, fd: FormData): Promise<FormState> {
  const reviewId = typeof fd.get("review_id") === "string" ? (fd.get("review_id") as string) : "";
  const raw = typeof fd.get("note") === "string" ? (fd.get("note") as string) : "";
  const { supabase } = await requireMember(
    ID_PATTERN.test(reviewId) ? platformPath("report", reviewId) : platformPath("account"),
  );
  const note = raw.trim();
  if (!ID_PATTERN.test(reviewId)) return { message: "Something went wrong. Please try again." };
  if (!note || note.length > 500) return { errors: { note: NOTE_NEEDED }, values: { note: raw } };

  const { error } = await supabase.rpc("report_review", { p_review: reviewId, p_note: note });
  if (error) {
    if (error.message === "report_note_required") return { errors: { note: NOTE_NEEDED }, values: { note: raw } };
    const message = REPORT_ERRORS[error.message];
    if (!message) console.error("report: report_review failed:", error.message);
    return { message: message ?? "Something went wrong. Please try again.", values: { note: raw } };
  }
  return { ok: true, message: REPORT_THANKS };
}
