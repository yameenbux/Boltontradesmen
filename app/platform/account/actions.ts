"use server";

import { redirect } from "next/navigation";
import { GROUP_CODE_ERROR, requireMember } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
import { platformPath } from "@/lib/paths";
import { createServerAuthClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/** Adds the Group member badge later, from the account page. */
export async function setGroupCode(_prev: FormState, fd: FormData): Promise<FormState> {
  const code = typeof fd.get("group_code") === "string" ? (fd.get("group_code") as string) : "";
  const { supabase } = await requireMember("/platform/account");
  if (!code.trim()) return { errors: { group_code: "Enter the group code." }, values: { group_code: code } };
  const { data, error } = await supabase.rpc("set_group_code", { p_code: code });
  if (error) {
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
