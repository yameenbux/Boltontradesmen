"use client";

import { useActionState } from "react";
import { AlertIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { setGroupCode } from "@/app/platform/account/actions";
import type { FormState } from "@/lib/admin-shared";

export function GroupCodeForm() {
  const [state, action, pending] = useActionState(setGroupCode, {} as FormState);
  const err = state.errors?.group_code;
  return (
    <form action={action} className="auth-form">
      <label className="field">
        Group code
        <span className="hint">
          From the Bolton Tradesmen WhatsApp group. It adds a Group member badge to your reviews.
        </span>
        <input
          name="group_code"
          className="input"
          autoComplete="off"
          autoCapitalize="characters"
          defaultValue={typeof state.values?.group_code === "string" ? state.values.group_code : ""}
          aria-invalid={err ? true : undefined}
        />
        {err && <span className="field-err">{err}</span>}
      </label>
      {state.message && !state.ok && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending}>
        {pending ? "Checking…" : "Add group code"}
      </Button>
    </form>
  );
}
