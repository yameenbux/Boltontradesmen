"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerAuthClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/admin-shared";

const schema = z.object({ email: z.string().trim().min(1), password: z.string().min(1) });

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Email or password is wrong" };

  const supabase = await createServerAuthClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { message: "Email or password is wrong" };

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) {
    await supabase.auth.signOut();
    return { message: "That account isn't an admin" };
  }
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createServerAuthClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
