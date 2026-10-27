"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { FormState } from "@/lib/admin-shared";

/** The trader's own card payment link (SumUp, Square, PayPal...), for their invoices' "Pay by card". */
export function PayLinkForm({ action, current }: { action: (prev: FormState, fd: FormData) => Promise<FormState>; current: string | null }) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const value = typeof state.values?.pay_link === "string" ? (state.values.pay_link as string) : (current ?? "");
  return (
    <form action={formAction} className="auth-form" aria-label="Your card payment link">
      <label className="field">
        <span>
          Your payment link<span className="opt"> (optional)</span>
        </span>
        <input
          key={value}
          name="pay_link"
          className="input"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={value}
          placeholder="https://pay.sumup.com/…"
        />
        <span className="hint">
          Already take cards with SumUp, Square, PayPal, Monzo or Revolut? Paste your payment link and your invoices
          show &ldquo;Pay by card&rdquo;. Mark the invoice paid when the money arrives.
        </span>
        {state.errors?.pay_link && <span className="field-err">{state.errors.pay_link}</span>}
      </label>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "form-ok" : "form-alert"}>
          {state.message}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending}>
        Save payment link
      </Button>
    </form>
  );
}
