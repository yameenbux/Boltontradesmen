"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import type { FormState } from "@/lib/admin-shared";
import { deliverQuestionAlerts } from "@/lib/notify";
import { revalidateQuestionPages } from "@/lib/revalidate-public";
import { ID_PATTERN } from "@/lib/review-form";

// Community questions: approve held questions, remove questions or answers (with a reason, kept in the audit log), or
// dismiss reports. Every action checks the admin itself; the database checks again (is_admin) and writes the audit row.

const text = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const id = z.string().regex(ID_PATTERN);
const REASON = "Enter a reason. It's kept in the audit log.";
const FAILED = "Something went wrong. Please try again.";

const FRIENDLY: Record<string, string> = {
  "question not pending": "That question has already been dealt with. Refresh the page.",
  "question not found": "That question has already been removed. Refresh the page.",
  "answer not found": "That answer has already been removed. Refresh the page.",
  "no open reports": "Those reports have already been dealt with. Refresh the page.",
};

function refused(where: string, error: { message: string }): FormState {
  const message = FRIENDLY[error.message];
  if (!message) console.error(`admin: ${where} failed:`, error.message);
  return { message: message ?? FAILED };
}

function refresh(questionId: unknown) {
  revalidateQuestionPages(typeof questionId === "string" && questionId ? questionId : undefined);
  revalidatePath("/admin/questions");
  revalidatePath("/admin");
}

export async function approveQuestion(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const q = id.safeParse(text(fd, "question_id"));
  if (!q.success) return { message: FAILED };
  const { data, error } = await supabase.rpc("admin_approve_question", { p_question: q.data });
  if (error) return refused("admin_approve_question", error);
  refresh(data);
  // It's public now: tell Pro traders in the trade who cover the area.
  const questionId = q.data;
  after(() => deliverQuestionAlerts(questionId));
  return { ok: true, message: "Approved. It's up now and open for 14 days." };
}

export async function removeQuestion(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const q = id.safeParse(text(fd, "question_id"));
  const reason = text(fd, "reason");
  if (!q.success) return { message: FAILED };
  if (!reason) return { errors: { reason: REASON }, values: { reason } };
  const { data, error } = await supabase.rpc("admin_remove_question", { p_question: q.data, p_reason: reason });
  if (error) return refused("admin_remove_question", error);
  refresh(data);
  return { ok: true, message: "Question removed." };
}

export async function removeAnswer(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const a = id.safeParse(text(fd, "answer_id"));
  const reason = text(fd, "reason");
  if (!a.success) return { message: FAILED };
  if (!reason) return { errors: { reason: REASON }, values: { reason } };
  const { data, error } = await supabase.rpc("admin_remove_question_answer", { p_answer: a.data, p_reason: reason });
  if (error) return refused("admin_remove_question_answer", error);
  refresh(data);
  return { ok: true, message: "Answer removed." };
}

export async function dismissReports(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const target = z
    .object({ type: z.enum(["question", "answer"]), id })
    .safeParse({ type: text(fd, "target_type"), id: text(fd, "target_id") });
  if (!target.success) return { message: FAILED };
  const { data, error } = await supabase.rpc("admin_dismiss_question_reports", {
    p_target_type: target.data.type,
    p_target_id: target.data.id,
    p_note: text(fd, "note") || null,
  });
  if (error) return refused("admin_dismiss_question_reports", error);
  refresh(data);
  return { ok: true, message: "Reports dismissed. It stays up." };
}
