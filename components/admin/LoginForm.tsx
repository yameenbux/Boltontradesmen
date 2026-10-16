"use client";

import { useActionState } from "react";
import { Turnstile } from "@/components/auth/Turnstile";
import { Button } from "@/components/ui/Button";
import { signIn } from "@/app/admin/login/actions";
import type { FormState } from "@/lib/admin-shared";

const initial: FormState = {};

/** `captchaSiteKey`: Cloudflare Turnstile, needed once Supabase's CAPTCHA is on (it checks password sign-ins). */
export function LoginForm({ captchaSiteKey = null }: { captchaSiteKey?: string | null }) {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="a-form">
      <label className="a-field">
        Email
        <input name="email" type="email" autoComplete="username" required className="a-input" />
      </label>
      <label className="a-field">
        Password
        <input name="password" type="password" autoComplete="current-password" required className="a-input" />
      </label>
      {state.message && (
        <p role="alert" className="a-err">
          {state.message}
        </p>
      )}
      <Turnstile siteKey={captchaSiteKey} resetKey={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
