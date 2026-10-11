import "server-only";
import { redirect } from "next/navigation";
import { createServerAuthClient } from "@/lib/supabase/server";

// Returns the signed-in admin's Supabase client, or redirects to the login page.
export async function requireAdmin() {
  const supabase = await createServerAuthClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/admin/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) redirect("/admin/login");
  return { supabase, user: data.user };
}
