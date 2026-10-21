import "server-only";
import { redirect } from "next/navigation";
import { createServerAuthClient } from "@/lib/supabase/server";

// Where the admin enters their authenticator code (or sets the authenticator up, the first time).
export const ADMIN_VERIFY_PATH = "/admin/verify";

// Returns the signed-in admin's Supabase client, or redirects: to the login page without a session, to the
// authenticator step when the password has been given but not the code. The database agrees: is_admin() is only
// true for a session that has passed both (aal2).
export async function requireAdmin() {
  const supabase = await createServerAuthClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/admin/login");
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel !== "aal2") redirect(ADMIN_VERIFY_PATH);
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) redirect("/admin/login");
  return { supabase, user: data.user };
}
