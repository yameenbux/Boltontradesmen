"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import type { FormState } from "@/lib/admin-shared";
import { deleteExpiredProofFiles, PROOF_RETENTION_MONTHS } from "@/lib/proof-retention";
import { ID_PATTERN } from "@/lib/review-form";
import { revalidatePublicPages } from "@/lib/revalidate-public";
import { createServiceClient } from "@/lib/supabase/service";

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

/**
 * A held review (an email-only account's) → published, or under check while an automatic flag is open (the
 * database decides).
 */
export async function approveReview(_prev: FormState, fd: FormData): Promise<FormState> {
  return setStatus(fd, "published", null, "Approved. It's on the provider's page now.");
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

/** Resolves or dismisses one flag, or every open flag on one review (the Flags page shows one card per review). */
export async function resolveFlag(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const flags = z.array(id).min(1).safeParse(fd.getAll("flag_id"));
  const outcome = z.enum(["resolved", "dismissed"]).safeParse(text(fd, "outcome"));
  if (!flags.success || !outcome.success) return { message: "Something went wrong. Please try again." };
  for (const flag of flags.data) {
    const { error } = await supabase.rpc("admin_resolve_flag", {
      p_flag: flag,
      p_outcome: outcome.data,
      p_note: text(fd, "note") || null,
    });
    if (error) return refused("admin_resolve_flag", error);
  }
  for (const p of QUEUES) revalidatePath(p);
  const n = flags.data.length;
  const verb = outcome.data === "resolved" ? "resolved" : "dismissed";
  return { ok: true, message: n === 1 ? `Flag ${verb}.` : `${n} flags ${verb}.` };
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

/** Deletes proof files checked over 12 months ago (the privacy notice's promise). Verified jobs stay verified. */
// useActionState passes (state, formData); this action needs neither.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteDueProofFiles(_prev: FormState, _fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  let n: number;
  try {
    n = await deleteExpiredProofFiles({
      due: async (limit) => {
        const { data, error } = await supabase.rpc("proof_files_due", { p_limit: limit });
        if (error) throw new Error(`proof_files_due failed: ${error.message}`);
        return (data ?? []) as { id: string; storage_path: string }[];
      },
      remove: async (paths) => createServiceClient().storage.from("review-proofs").remove(paths),
      mark: async (ids) => {
        const { data, error } = await supabase.rpc("mark_proof_files_deleted", { p_ids: ids });
        if (error) throw new Error(`mark_proof_files_deleted failed: ${error.message}`);
        return typeof data === "number" ? data : 0;
      },
    });
  } catch (err) {
    console.error("admin: deleting old proof files failed:", err);
    return { message: "Something went wrong. Please try again." };
  }
  if (n === 0) return { ok: true, message: "No proof files are due for deletion." };
  return {
    ok: true,
    message: `Deleted ${n} proof ${n === 1 ? "file" : "files"} checked over ${PROOF_RETENTION_MONTHS} months ago.`,
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
