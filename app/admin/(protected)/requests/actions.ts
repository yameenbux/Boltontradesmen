"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import type { FormState } from "@/lib/admin-shared";
import { ID_PATTERN } from "@/lib/review-form";

// "Get listed" requests: the admin marks each one done (dealt with) or spam, or back to new. The action checks the
// admin, the database checks again (is_admin) and writes the audit row.

const input = z.object({
  request_id: z.string().regex(ID_PATTERN),
  status: z.enum(["new", "done", "spam"]),
});

const DONE: Record<z.infer<typeof input>["status"], string> = {
  new: "Moved back to new.",
  done: "Marked done.",
  spam: "Marked as spam.",
};

export async function setRequestStatus(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const parsed = input.safeParse({ request_id: fd.get("request_id"), status: fd.get("status") });
  if (!parsed.success) return { message: "Something went wrong. Please try again." };
  const { error } = await supabase.rpc("admin_set_listing_request_status", {
    p_id: parsed.data.request_id,
    p_status: parsed.data.status,
  });
  if (error) {
    if (error.message === "listing request not found") {
      return { message: "That request has gone (requests are deleted after 90 days). Refresh the page." };
    }
    console.error("admin: admin_set_listing_request_status failed:", error.message);
    return { message: "Something went wrong. Please try again." };
  }
  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  return { ok: true, message: DONE[parsed.data.status] };
}
