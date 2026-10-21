"use server";

import { revalidatePath } from "next/cache";
import { CONTACT_EMAIL } from "@/components/site/content";
import { requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
import { platformPath } from "@/lib/paths";
import { ID_PATTERN } from "@/lib/review-form";
import { createServiceClient } from "@/lib/supabase/service";

const THANKS = "Thanks. We'll take a look. A report doesn't take anything down on its own.";
const NOTE_NEEDED = "Tell us what's wrong with it, in up to 500 characters.";
const FAILED = "Something went wrong. Please try again.";

const REPORT_ERRORS: Record<string, string> = {
  already_reported: "You've already reported this. We'll look at it.",
  not_found: "That isn't on the site any more.",
  report_limit: `You've sent 10 reports today, which is the most we take from one person in a day. Please try again tomorrow, or email ${CONTACT_EMAIL}.`,
  blocked: "Your account can't send reports. Contact us if you think that's wrong.",
};

const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

/** A signed-in person's report on a question or an answer, for the admin's questions page. */
export async function reportQuestionContent(_prev: FormState, fd: FormData): Promise<FormState> {
  const questionId = field(fd, "question_id");
  const answerId = field(fd, "answer_id");
  const raw = field(fd, "note");
  const { user } = await requireMember(
    ID_PATTERN.test(questionId) ? platformPath("ask", questionId, "report") : platformPath("ask"),
  );
  if (!ID_PATTERN.test(questionId) || (answerId && !ID_PATTERN.test(answerId))) return { message: FAILED };
  const note = raw.trim();
  if (!note || note.length > 500) return { errors: { note: NOTE_NEEDED }, values: { note: raw } };

  const { error } = await createServiceClient().rpc("report_question_content", {
    p_uid: user.id,
    p_target_type: answerId ? "answer" : "question",
    p_target_id: answerId || questionId,
    p_note: note,
  });
  if (error) {
    if (error.message === "report_note_required") return { errors: { note: NOTE_NEEDED }, values: { note: raw } };
    const message = REPORT_ERRORS[error.message];
    if (!message) console.error("ask: report_question_content failed:", error.message);
    return { message: message ?? FAILED, values: { note: raw } };
  }
  revalidatePath("/admin/questions");
  return { ok: true, message: THANKS };
}
