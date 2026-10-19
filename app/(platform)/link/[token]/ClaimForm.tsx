"use client";

import { useActionState } from "react";
import { AlertIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import type { FormState } from "@/lib/admin-shared";
import { claimTraderLink } from "./actions";

export function ClaimForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(claimTraderLink, {} as FormState);
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="token" value={token} />
      {state.message && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Linking…" : "Yes, this is my business"}
      </Button>
    </form>
  );
}
