"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
import { platformPath } from "@/lib/paths";
import {
  noteProblem,
  QUESTION_ERROR_FIELD,
  QUESTION_ERRORS,
  QUESTION_FALLBACK_ERROR,
  questionErrorMessage,
  tidyText,
  type QuestionErrorCode,
} from "@/lib/questions";
import { revalidateQuestionPages } from "@/lib/revalidate-public";
import { ID_PATTERN } from "@/lib/review-form";
import { createServiceClient } from "@/lib/supabase/service";

const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

/**
 * An answer: a listed provider recommended (kind "recommend"), or a linked trader's "I can help" for their own listing
 * (kind "can_help"). submit_question_answer (service role only) applies every rule again with the user id from the
 * verified session: one answer per account, never your own business as a recommendation, open questions only.
 */
export async function answerQuestion(_prev: FormState, fd: FormData): Promise<FormState> {
  const questionId = field(fd, "question_id");
  const { user } = await requireMember(
    ID_PATTERN.test(questionId) ? platformPath("ask", questionId, "answer") : platformPath("ask"),
  );
  const kind = field(fd, "kind") === "can_help" ? "can_help" : "recommend";
  const values = { kind, provider_id: field(fd, "provider_id"), note: field(fd, "note") };
  if (!ID_PATTERN.test(questionId)) return { message: QUESTION_FALLBACK_ERROR, values };
  const errors: Record<string, string> = {};
  if (!ID_PATTERN.test(values.provider_id)) {
    errors.provider_id = kind === "can_help" ? QUESTION_ERRORS.not_your_listing : "Choose who you recommend.";
  }
  const problem = noteProblem(values.note);
  if (problem) errors.note = QUESTION_ERRORS[problem];
  if (Object.keys(errors).length > 0) return { errors, values };

  const { error } = await createServiceClient().rpc("submit_question_answer", {
    p_uid: user.id,
    p_question: questionId,
    p_kind: kind,
    p_provider: values.provider_id,
    p_note: tidyText(values.note) || null,
  });
  if (error) {
    const code = error.message as QuestionErrorCode;
    if (!(code in QUESTION_ERRORS)) console.error("ask: submit_question_answer failed:", error.message);
    const key = QUESTION_ERROR_FIELD[code];
    const message = questionErrorMessage(error);
    return key ? { errors: { [key]: message }, values } : { message, values };
  }
  revalidateQuestionPages(questionId);
  redirect(platformPath("ask", questionId));
}
