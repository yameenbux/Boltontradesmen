"use client";

import { useActionState } from "react";
import { signIn } from "@/app/admin/login/actions";
import type { FormState } from "@/lib/admin-shared";

const initial: FormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 font-semibold">
        Email
        <input name="email" type="email" autoComplete="username" required className="min-h-12 rounded border border-neutral-500 px-3 font-normal" />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Password
        <input name="password" type="password" autoComplete="current-password" required className="min-h-12 rounded border border-neutral-500 px-3 font-normal" />
      </label>
      {state.message && (
        <p role="alert" className="font-semibold text-red-800">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-12 rounded bg-neutral-900 px-4 font-bold text-white disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
