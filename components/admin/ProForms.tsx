"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { decideProDocument, deleteDueProFiles } from "@/app/admin/(protected)/pro/actions";
import type { FormState } from "@/lib/admin-shared";

function Result({ state }: { state: FormState }) {
  if (!state.message) return null;
  return state.ok ? (
    <p role="status" className="a-ok">
      {state.message}
    </p>
  ) : (
    <p role="alert" className="a-err">
      {state.message}
    </p>
  );
}

/** Approve or reject one Pro document; rejecting needs a reason, which the trader sees. */
export function ProDocumentDecision({ docId, kind }: { docId: string; kind: string }) {
  const [state, action, pending] = useActionState(decideProDocument, {} as FormState);
  const err = state.errors?.reason;
  const reason = typeof state.values?.reason === "string" ? state.values.reason : "";
  if (state.ok) return <Result state={state} />;
  return (
    <form action={action} className="a-form">
      <input type="hidden" name="doc_id" value={docId} />
      <label className="a-field">
        <span>
          Reason <span className="a-hint">(needed to reject; the trader sees it)</span>
        </span>
        <input
          name="reason"
          className="a-input"
          maxLength={300}
          defaultValue={reason}
          aria-invalid={err ? true : undefined}
        />
        {err && <span className="a-err">{err}</span>}
      </label>
      <div className="a-actions">
        <Button type="submit" name="decision" value="approved" disabled={pending}>
          {kind === "photo_id" ? "Approve: ID checked" : "Approve"}
        </Button>
        <Button type="submit" name="decision" value="rejected" variant="secondary" disabled={pending}>
          Reject
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

/** Deletes documents decided over 30 days ago (until scheduled jobs run it). */
export function DeleteDueProFilesForm() {
  const [state, action, pending] = useActionState(deleteDueProFiles, {} as FormState);
  return (
    <form action={action} className="a-form">
      <div className="a-actions">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Deleting…" : "Delete documents due now"}
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}
