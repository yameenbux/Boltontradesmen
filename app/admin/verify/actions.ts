"use server";

import { redirect } from "next/navigation";
import { recordFailure, tooManyFailures } from "@/lib/rate-limit";
import { createServerAuthClient } from "@/lib/supabase/server";

export type VerifyState = { message?: string; factorId?: string; qr?: string; secret?: string };

const CODE = /^\d{6}$/;

/** The signed-in admin account (password given), or back to the login page. */
async function adminAccount() {
  const supabase = await createServerAuthClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/admin/login");
  const { data: isAdminAccount } = await supabase.rpc("am_i_admin_account");
  if (isAdminAccount !== true) {
    await supabase.auth.signOut();
    redirect("/admin/login");
  }
  return { supabase, user: data.user };
}

/**
 * The admin's second step. intent=setup (first time only): a new authenticator, shown as a QR code to scan. Then the
 * 6-digit code, which upgrades the session to aal2 (is_admin() needs it). Wrong codes: 5 per 15 minutes.
 */
export async function verifyStep(prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const { supabase, user } = await adminAccount();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError || !factors) return { ...prev, message: "Something went wrong. Please try again." };

  if (formData.get("intent") === "setup") {
    // Only while no authenticator is set up: once there is one, a stolen password can't add another.
    if (factors.totp.length > 0) return { message: "An authenticator is already set up. Enter its code." };
    for (const f of factors.all) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Bolton Vouched admin" });
    if (error || !data) {
      console.error("admin: authenticator setup failed:", error?.message);
      return { message: "Couldn't start the setup. Please try again." };
    }
    return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  }

  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!CODE.test(code)) return { ...prev, message: "Enter the 6-digit code from your authenticator app." };
  // The verified authenticator, or the one being set up in this browser (it must be this account's).
  const pending = String(formData.get("factorId") ?? "");
  const factorId = factors.totp[0]?.id ?? factors.all.find((f) => f.id === pending)?.id;
  if (!factorId) return { message: "Set up your authenticator first." };
  if (await tooManyFailures("admin-mfa", user.id, 5, 900, false)) {
    return { ...prev, message: "Too many wrong codes. Please wait 15 minutes and try again." };
  }
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    // Only a wrong code counts towards the limit (not, say, a session that ended meanwhile).
    if (error.code === "mfa_verification_failed") await recordFailure("admin-mfa", user.id);
    else console.error("admin: code check failed:", error.code, error.message);
    return { ...prev, message: "That code didn't work. Check the time on your phone and try the newest code." };
  }
  redirect("/admin");
}
