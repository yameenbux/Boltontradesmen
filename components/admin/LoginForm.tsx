"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { signIn } from "@/app/admin/login/actions";
import type { FormState } from "@/lib/admin-shared";

const initial: FormState = {};

export function LoginForm() {
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
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
