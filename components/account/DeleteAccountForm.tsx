"use client";

import { useActionState } from "react";
import { AlertIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { deleteAccount } from "@/app/(platform)/account/actions";
import type { FormState } from "@/lib/admin-shared";

/** The confirm step of Delete account: one checkbox, then the button. */
export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccount, {} as FormState);
  const err = state.errors?.confirm;
  return (
    <form action={action} className="auth-form">
      <label className={`confirm-box${err ? " has-err" : ""}`}>
        <input type="checkbox" name="confirm" aria-invalid={err ? true : undefined} aria-describedby={err ? "confirm-err" : undefined} />
        <span>I understand my reviews will be taken down</span>
      </label>
      {err && (
        <span id="confirm-err" className="field-err">
          {err}
        </span>
      )}
      {state.message && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <Button type="submit" variant="secondary" className="btn-danger" disabled={pending} aria-busy={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
    </form>
  );
}
