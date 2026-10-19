"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import type { FormState } from "@/lib/admin-shared";
import { deliverApproval } from "@/lib/notify";
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

const approveInput = z.object({
  request_id: z.string().regex(ID_PATTERN),
  provider_id: z.string().regex(ID_PATTERN),
  phone: z.string().regex(/^\+44[0-9]{9,10}$/),
});

const APPROVE_REFUSED: Record<string, string> = {
  no_account: "This request didn't come from an account. Send them a trader sign-in link from their listing instead.",
  not_agreed: "They haven't agreed to the listing yet. Send the consent link first, then approve.",
  already_linked: "That listing is already linked to a different account.",
  account_gone: "Their account has been deleted.",
};

/** Approve a trader's request: link the listing to their account, then tell them by email and text. */
export async function approveRequest(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const parsed = approveInput.safeParse({
    request_id: fd.get("request_id"),
    provider_id: fd.get("provider_id"),
    phone: fd.get("phone"),
  });
  if (!parsed.success) return { message: "Something went wrong. Please try again." };
  const { data, error } = await supabase.rpc("admin_approve_listing_request", {
    p_id: parsed.data.request_id,
    p_provider: parsed.data.provider_id,
  });
  if (error) {
    const refused = APPROVE_REFUSED[error.message];
    if (refused) return { message: refused };
    console.error("admin: admin_approve_listing_request failed:", error.message);
    return { message: "Something went wrong. Please try again." };
  }
  const a = data as { email: string | null; contact_name: string; business_name: string; plan: "free" | "pro" };
  const sent = await deliverApproval(
    { email: a.email, phone: parsed.data.phone },
    { name: a.contact_name.split(" ")[0] || a.contact_name, business: a.business_name, pro: a.plan === "pro" },
  );
  // No revalidatePath (the admin pages render per request anyway): the card stays with this message until the page
  // is next loaded, where the request shows under Done.
  const told = [sent.email && "email", sent.sms && "text"].filter(Boolean).join(" and ");
  return {
    ok: true,
    message: told
      ? `Approved and linked. They've been told by ${told}.`
      : "Approved and linked, but the email and text didn't send (check the email and text settings in Railway). Tell them yourself.",
  };
}
