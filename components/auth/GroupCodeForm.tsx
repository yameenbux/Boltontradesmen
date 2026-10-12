"use client";

import { useActionState } from "react";
import { AlertIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { setGroupCode } from "@/app/platform/account/actions";
import type { FormState } from "@/lib/admin-shared";

// The code is a short word shared in the group. The server only checks it isn't blank and matches; this just stops
// a pasted paragraph.
const GROUP_CODE_MAX = 40;

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
          required
          maxLength={GROUP_CODE_MAX}
          defaultValue={typeof state.values?.group_code === "string" ? state.values.group_code : ""}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? "group-code-err" : undefined}
        />
        {err && (
          <span id="group-code-err" className="field-err">
            {err}
          </span>
        )}
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
