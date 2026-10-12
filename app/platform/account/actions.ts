"use server";

import { redirect } from "next/navigation";
import {
  DELETE_ADMIN_MESSAGE,
  DELETE_CONFIRM_ERROR,
  DELETE_FAILED_MESSAGE,
  DELETE_RETRY_MESSAGE,
} from "@/lib/account-text";
import { GROUP_CODE_ERROR, GROUP_CODE_LIMIT_ACCOUNT, requireMember, requireSignedIn } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
import { platformPath } from "@/lib/paths";
import { revalidatePublicPages } from "@/lib/revalidate-public";
import { createServerAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

/** Adds the Group member badge later, from the account page. */
export async function setGroupCode(_prev: FormState, fd: FormData): Promise<FormState> {
  const code = typeof fd.get("group_code") === "string" ? (fd.get("group_code") as string) : "";
  const { supabase } = await requireMember("/platform/account");
  if (!code.trim()) return { errors: { group_code: "Enter the group code." }, values: { group_code: code } };
  const { data, error } = await supabase.rpc("set_group_code", { p_code: code });
  if (error) {
    if (error.message === "group_code_limit") {
      return { errors: { group_code: GROUP_CODE_LIMIT_ACCOUNT }, values: { group_code: code } };
    }
    console.error("account: set_group_code failed:", error.message);
    return { message: "Something went wrong. Please try again.", values: { group_code: code } };
  }
  if (data !== true) return { errors: { group_code: GROUP_CODE_ERROR }, values: { group_code: code } };
  revalidatePath("/platform/account");
  return { ok: true, message: "You're now shown as a Group member." };
}

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
