import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VerifyForm } from "@/components/admin/VerifyForm";
import { Button } from "@/components/ui/Button";
import { signOut } from "@/app/admin/login/actions";
import { createServerAuthClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin code | Bolton Vouched",
  description: "The second step of the admin sign-in.",
  robots: { index: false },
};

// After the admin password: the code from the authenticator app (set up here the first time).
export default async function VerifyPage() {
  const supabase = await createServerAuthClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/admin/login");
  const { data: isAdminAccount } = await supabase.rpc("am_i_admin_account");
  if (isAdminAccount !== true) redirect("/admin/login");
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel === "aal2") redirect("/admin");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasAuthenticator = (factors?.totp.length ?? 0) > 0;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-5 py-6">
      <h1 className="a-title">{hasAuthenticator ? "Enter your code" : "Set up two-step sign-in"}</h1>
      <div className="a-card">
        <VerifyForm hasAuthenticator={hasAuthenticator} />
      </div>
      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </main>
  );
}
