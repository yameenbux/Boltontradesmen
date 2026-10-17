"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import type { FormState } from "@/lib/admin-shared";
import { deleteExpiredProofFiles } from "@/lib/proof-retention";
import { ID_PATTERN } from "@/lib/review-form";
import { revalidatePublicPages } from "@/lib/revalidate-public";
import { createServiceClient } from "@/lib/supabase/service";

const DECIDE_ERRORS: Record<string, { field?: "reason"; message: string }> = {
  reason_required: { field: "reason", message: "Say why, so the trader knows what to send instead." },
  reason_too_long: { field: "reason", message: "Keep the reason to 300 characters." },
  already_decided: { message: "This document has already been decided." },
  bad_decision: { message: "Choose approve or reject." },
};

/** Approves or rejects a Pro document. A rejected photo ID means a full refund, made by hand in Stripe. */
export async function decideProDocument(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const docId = fd.get("doc_id");
  const decision = fd.get("decision");
  const reason = typeof fd.get("reason") === "string" ? (fd.get("reason") as string).trim() : "";
  const values = { reason };
  if (typeof docId !== "string" || !ID_PATTERN.test(docId)) return { message: "Something went wrong. Please try again." };
  const { data, error } = await supabase.rpc("admin_decide_pro_document", {
    p_doc: docId,
    p_decision: decision,
    p_reason: reason || null,
  });
  if (error) {
    const known = DECIDE_ERRORS[error.message];
    if (!known) {
      console.error("admin: admin_decide_pro_document failed:", error.message);
      return { message: "Something went wrong. Please try again.", values };
    }
    return known.field ? { errors: { [known.field]: known.message }, values } : { message: known.message, values };
  }
  revalidatePublicPages(typeof data === "string" ? data : undefined);
  revalidatePath("/admin/pro");
  return {
    ok: true,
    message:
      decision === "approved"
        ? "Approved."
        : "Rejected. If it was their photo ID, refund their Pro payment in full in Stripe.",
  };
}

/** Deletes ID and other Pro documents decided over 30 days ago (the privacy notice's promise). Decisions stay. */
// useActionState passes (state, formData); this action needs neither.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteDueProFiles(_prev: FormState, _fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  let n: number;
  try {
    n = await deleteExpiredProofFiles({
      due: async (limit) => {
        const { data, error } = await supabase.rpc("pro_id_files_due", { p_limit: limit });
        if (error) throw new Error(`pro_id_files_due failed: ${error.message}`);
        return (data ?? []) as { id: string; storage_path: string }[];
      },
      remove: async (paths) => createServiceClient().storage.from("pro-id").remove(paths),
      mark: async (ids) => {
        const { data, error } = await supabase.rpc("mark_pro_id_files_deleted", { p_ids: ids });
        if (error) throw new Error(`mark_pro_id_files_deleted failed: ${error.message}`);
        return typeof data === "number" ? data : 0;
      },
    });
  } catch (err) {
    console.error("admin: deleting old Pro documents failed:", err);
    return { message: "Something went wrong. Please try again." };
  }
  revalidatePath("/admin/pro");
  if (n === 0) return { ok: true, message: "No documents are due for deletion." };
  return { ok: true, message: `Deleted ${n} ${n === 1 ? "document" : "documents"} decided over 30 days ago.` };
}
