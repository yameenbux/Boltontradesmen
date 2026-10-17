"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
import { platformPath } from "@/lib/paths";
import {
  bodyProblem,
  isDistrict,
  QUESTION_ERROR_FIELD,
  QUESTION_ERRORS,
  questionErrorMessage,
  tidyText,
  type QuestionErrorCode,
} from "@/lib/questions";
import { revalidateQuestionPages } from "@/lib/revalidate-public";
import { ID_PATTERN } from "@/lib/review-form";
import { createServiceClient } from "@/lib/supabase/service";

export type AskState = FormState & { held?: boolean };

const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

/**
 * A new question. submit_question (service role only) applies every rule again: the user id comes from the verified
 * session, never the form. A question from an email-only account is held for the admin; any other goes straight up.
 */
export async function askQuestion(_prev: AskState, fd: FormData): Promise<AskState> {
  const { user } = await requireMember(platformPath("ask", "new"));
  const values = { category_id: field(fd, "category_id"), district: field(fd, "district"), body: field(fd, "body") };
  const errors: Record<string, string> = {};
  if (!ID_PATTERN.test(values.category_id)) errors.category_id = QUESTION_ERRORS.bad_category;
  if (!isDistrict(values.district)) errors.district = QUESTION_ERRORS.bad_district;
  const problem = bodyProblem(values.body);
  if (problem) errors.body = QUESTION_ERRORS[problem];
  if (Object.keys(errors).length > 0) return { errors, values };

  const { data, error } = await createServiceClient().rpc("submit_question", {
    p_uid: user.id,
    p_category: values.category_id,
    p_district: values.district,
    p_body: tidyText(values.body),
  });
  if (error) {
    const code = error.message as QuestionErrorCode;
    if (!(code in QUESTION_ERRORS)) console.error("ask: submit_question failed:", error.message);
    const key = QUESTION_ERROR_FIELD[code];
    const message = questionErrorMessage(error);
    return key ? { errors: { [key]: message }, values } : { message, values };
  }
  const row = (data ?? {}) as { id?: string; status?: string };
  if (row.status === "pending") return { ok: true, held: true };
  revalidateQuestionPages(row.id);
  redirect(row.id ? platformPath("ask", row.id) : platformPath("ask"));
}
