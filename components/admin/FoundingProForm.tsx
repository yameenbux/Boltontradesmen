"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { endFoundingPro, grantFoundingPro } from "@/app/admin/(protected)/providers/actions";
import type { FormState } from "@/lib/admin-shared";

const initial: FormState = {};

/**
 * Founding Pro: Pro switched on without Stripe, until a date ("Founding trader, free for 6 months"). Saving again
 * replaces the date and note; ending it switches Pro off now (a Stripe subscription, if any, is untouched).
 */
export function FoundingProForm({
  providerId,
  grant,
  suggestedUntil,
}: {
  providerId: string;
  grant: { until: string; note: string | null; active: boolean } | null;
  suggestedUntil: string;
}) {
  const [state, action, pending] = useActionState(grantFoundingPro, initial);
  const [endState, endAction, ending] = useActionState(endFoundingPro, initial);
  const val = (k: string, fallback: string) => (state.values?.[k] as string | undefined) ?? fallback;
  return (
    <div className="grid gap-3" data-testid="founding-pro">
      <form action={action} className="a-form" aria-label="Founding Pro">
        <input type="hidden" name="provider_id" value={providerId} />
        <label className="a-field">
          Free Pro until (last day)
          <input name="until" type="date" required defaultValue={val("until", grant?.until ?? suggestedUntil)} className="a-input" />
          {state.errors?.until && (
            <span role="alert" className="a-err">
              {state.errors.until}
            </span>
          )}
        </label>
        <label className="a-field">
          Note (optional, the trader sees it)
          <input name="note" maxLength={200} defaultValue={val("note", grant?.note ?? "Founding trader")} className="a-input" />
          {state.errors?.note && (
            <span role="alert" className="a-err">
              {state.errors.note}
            </span>
          )}
        </label>
        {state.message && (
          <p role={state.ok ? "status" : "alert"} className={state.ok ? "a-ok" : "a-err"}>
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {grant ? "Save founding Pro" : "Switch on founding Pro"}
        </Button>
      </form>
      {grant && (
        <form action={endAction}>
          <input type="hidden" name="provider_id" value={providerId} />
          {endState.message && (
            <p role={endState.ok ? "status" : "alert"} className={endState.ok ? "a-ok" : "a-err"}>
              {endState.message}
            </p>
          )}
          <Button type="submit" variant="secondary" disabled={ending} aria-busy={ending}>
            End founding Pro now
          </Button>
        </form>
      )}
    </div>
  );
}
