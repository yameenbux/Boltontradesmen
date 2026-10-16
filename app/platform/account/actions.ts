"use server";

import { redirect } from "next/navigation";
import {
  DELETE_ADMIN_MESSAGE,
  DELETE_CONFIRM_ERROR,
  DELETE_FAILED_MESSAGE,
  DELETE_RETRY_MESSAGE,
} from "@/lib/account-text";
import { requireSignedIn } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
import { platformPath } from "@/lib/paths";
import { revalidatePublicPages } from "@/lib/revalidate-public";
import { createServerAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

export async function signOutResident(): Promise<void> {
  const supabase = await createServerAuthClient();
  await supabase.auth.signOut();
  redirect(platformPath());
}

/**
 * Delete account: take the person's reviews and replies down and keep their number privately for 12 months
 * (delete_my_account), then soft-delete the Auth user (the row stays for the reviews' foreign key; GoTrue
 * obfuscates the phone so the number can sign up afresh), then sign out here — a Server Component can't clear
 * the cookie — and land on a page that says it's done. Both steps are safe to repeat, so a failed soft delete is retried by submitting again.
 * Uses requireSignedIn, not requireMember: after the first step the profile already reads as deleted.
 */
export async function deleteAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, user } = await requireSignedIn(platformPath("account"));
  if (!fd.get("confirm")) return { errors: { confirm: DELETE_CONFIRM_ERROR } };

  const { data, error } = await supabase.rpc("delete_my_account");
  if (error) {
    if (error.message === "admin_account") return { message: DELETE_ADMIN_MESSAGE };
    console.error("account: delete_my_account failed:", error.message);
    return { message: DELETE_FAILED_MESSAGE };
  }
  let softDeleted = false;
  try {
    const { error: authError } = await createServiceClient().auth.admin.deleteUser(user.id, true);
    if (authError) console.error("account: soft delete failed:", (authError as { message?: string }).message);
    else softDeleted = true;
  } catch (e) {
    console.error("account: soft delete failed:", e);
  }
  if (!softDeleted) return { message: DELETE_RETRY_MESSAGE };

  await supabase.auth.signOut({ scope: "local" });
  for (const slug of (data ?? []) as string[]) revalidatePublicPages(slug);
  revalidatePath("/platform/account");
  redirect(platformPath("account", "deleted"));
}
