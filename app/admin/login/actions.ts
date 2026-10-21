"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ADMIN_VERIFY_PATH } from "@/lib/admin";
import { clientIpFrom } from "@/lib/client-ip";
import { ipHash } from "@/lib/ip-hash";
import { recordFailure, tooManyFailures } from "@/lib/rate-limit";
import { createServerAuthClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/admin-shared";

const LOCKED = "Too many sign-in attempts. Please wait 15 minutes and try again.";

const schema = z.object({ email: z.string().trim().min(1), password: z.string().min(1) });

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Email or password is wrong" };

  // Wrong passwords are limited per address (5) and per connection (20) every 15 minutes, here: Supabase's own
  // limit only sees this server's address. If the limit can't be checked, nobody signs in (fails closed).
  const account = createHash("sha256").update(parsed.data.email.toLowerCase()).digest("hex");
  const ip = ipHash(clientIpFrom(await headers()) || "unknown");
  if (
    (await tooManyFailures("admin-login-account", account, 5, 900, false)) ||
    (await tooManyFailures("admin-login-ip", ip, 20, 900, false))
  ) {
    return { message: LOCKED };
  }

  // Supabase's CAPTCHA (Turnstile), when on, checks password sign-ins itself: pass the widget's token through.
  const token = formData.get("cf-turnstile-response");
  const captchaToken = typeof token === "string" && token.trim() ? token.trim() : undefined;
  const supabase = await createServerAuthClient();
  const { error } = await supabase.auth.signInWithPassword(
    captchaToken ? { ...parsed.data, options: { captchaToken } } : parsed.data,
  );
  if (error) {
    await Promise.all([recordFailure("admin-login-account", account), recordFailure("admin-login-ip", ip)]);
    return { message: "Email or password is wrong" };
  }

  // The password is only the first step: the admin pages need the authenticator code too (is_admin() needs aal2).
  const { data: isAdmin } = await supabase.rpc("am_i_admin_account");
  if (isAdmin !== true) {
    await supabase.auth.signOut();
    return { message: "Email or password is wrong" };
  }
  redirect(ADMIN_VERIFY_PATH);
}

export async function signOut() {
  const supabase = await createServerAuthClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
