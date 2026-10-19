"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { FormState } from "@/lib/admin-shared";
import { sortCode, type Billing } from "@/lib/trade-docs";

/** The bank details printed on the trader's invoices. */
export function BillingForm({ action, billing }: { action: (prev: FormState, fd: FormData) => Promise<FormState>; billing: Billing | null }) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const err = state.errors ?? {};
  const v = (k: keyof Billing, fallback: string) => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : fallback);
  return (
    <form action={formAction} className="auth-form" aria-label="Bank details for invoices">
      <label className="field">
        <span>Name on the account</span>
        <input name="account_name" className="input" required maxLength={70} defaultValue={v("account_name", billing?.account_name ?? "")} autoComplete="off" />
        {err.account_name && <span className="field-err">{err.account_name}</span>}
      </label>
      <label className="field">
        <span>Sort code</span>
        <input name="sort_code" className="input" required inputMode="numeric" placeholder="12-34-56" defaultValue={v("sort_code", billing ? sortCode(billing.sort_code) : "")} autoComplete="off" />
        {err.sort_code && <span className="field-err">{err.sort_code}</span>}
      </label>
      <label className="field">
        <span>Account number</span>
        <input name="account_number" className="input" required inputMode="numeric" maxLength={9} defaultValue={v("account_number", billing?.account_number ?? "")} autoComplete="off" />
        {err.account_number && <span className="field-err">{err.account_number}</span>}
      </label>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "form-ok" : "form-alert"}>
          {state.message}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending}>
        Save bank details
      </Button>
    </form>
  );
}
