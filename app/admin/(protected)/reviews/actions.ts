"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import type { FormState } from "@/lib/admin-shared";
import { ID_PATTERN } from "@/lib/review-form";
import { revalidatePublicPages } from "@/lib/revalidate-public";

// Moderation: every action checks the admin itself, the database checks again (is_admin) and writes the audit row.

const text = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const id = z.string().regex(ID_PATTERN);
const REASON = "Enter a reason. It's kept in the audit log.";
const QUEUES = ["/admin", "/admin/reviews", "/admin/flags", "/admin/proofs"];

const FRIENDLY: Record<string, string> = {
  "transition not allowed": "That review has already been dealt with. Refresh the page.",
  "flag not open": "That flag has already been dealt with. Refresh the page.",
  "proof already checked": "That proof has already been checked. Refresh the page.",
  "reply not found": "That reply has already been removed. Refresh the page.",
  "review not found": "That review couldn't be found. Refresh the page.",
};

function refused(where: string, error: { message: string }): FormState {
  const message = FRIENDLY[error.message];
  if (!message) console.error(`admin: ${where} failed:`, error.message);
  return { message: message ?? "Something went wrong. Please try again." };
}

function refresh(slug: unknown) {
  revalidatePublicPages(typeof slug === "string" && slug ? slug : undefined);
  for (const p of QUEUES) revalidatePath(p);
}

async function setStatus(
  fd: FormData,
  status: "published" | "removed",
  reason: string | null,
  done: string,
): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const review = id.safeParse(text(fd, "review_id"));
  if (!review.success) return { message: "Something went wrong. Please try again." };
  const { data, error } = await supabase.rpc("admin_set_review_status", {
    p_review: review.data,
    p_status: status,
    p_reason: reason,
  });
  if (error) return refused("admin_set_review_status", error);
  refresh(data);
  return { ok: true, message: done };
}

/** Under check → published: the automatic flags are resolved; any report stays for its own answer. */
export async function clearReview(_prev: FormState, fd: FormData): Promise<FormState> {
  return setStatus(fd, "published", text(fd, "reason") || null, "Check cleared. The review no longer shows the label.");
}

/** Removal is for cause, needs a reason, and is final. */
export async function removeReview(_prev: FormState, fd: FormData): Promise<FormState> {
  const reason = text(fd, "reason");
  if (!reason) {
    await requireAdmin();
    return { errors: { reason: REASON }, values: { reason } };
  }
  return setStatus(fd, "removed", reason, "Review removed. The reason is in the audit log.");
}

export async function resolveFlag(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const flag = id.safeParse(text(fd, "flag_id"));
  const outcome = z.enum(["resolved", "dismissed"]).safeParse(text(fd, "outcome"));
  if (!flag.success || !outcome.success) return { message: "Something went wrong. Please try again." };
  const { error } = await supabase.rpc("admin_resolve_flag", {
    p_flag: flag.data,
    p_outcome: outcome.data,
    p_note: text(fd, "note") || null,
  });
  if (error) return refused("admin_resolve_flag", error);
  for (const p of QUEUES) revalidatePath(p);
  return { ok: true, message: outcome.data === "resolved" ? "Flag resolved." : "Flag dismissed." };
}

/** Accepting a proof makes the review show "Verified job"; rejecting needs a note. */
export async function checkProof(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const proof = id.safeParse(text(fd, "proof_id"));
  const outcome = z.enum(["accepted", "rejected"]).safeParse(text(fd, "outcome"));
  if (!proof.success || !outcome.success) return { message: "Something went wrong. Please try again." };
  const note = text(fd, "note");
  if (outcome.data === "rejected" && !note) {
    return { errors: { note: "Say why, so you remember later." }, values: { note } };
  }
  const { data, error } = await supabase.rpc("admin_check_proof", {
    p_proof: proof.data,
    p_outcome: outcome.data,
    p_note: note || null,
  });
  if (error) return refused("admin_check_proof", error);
  refresh(data);
  return {
    ok: true,
    message: outcome.data === "accepted" ? "Accepted. The review shows Verified job." : "Proof rejected.",
  };
}

export async function removeReply(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const reply = id.safeParse(text(fd, "reply_id"));
  const reason = text(fd, "reason");
  if (!reply.success) return { message: "Something went wrong. Please try again." };
  if (!reason) return { errors: { reason: REASON }, values: { reason } };
  const { data, error } = await supabase.rpc("admin_remove_reply", { p_reply: reply.data, p_reason: reason });
  if (error) return refused("admin_remove_reply", error);
  refresh(data);
  return { ok: true, message: "Reply removed. The reason is in the audit log." };
}
