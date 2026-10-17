"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import {
  approveQuestion,
  dismissReports,
  removeAnswer,
  removeQuestion,
} from "@/app/admin/(protected)/questions/actions";
import type { FormState } from "@/lib/admin-shared";

const v = (s: FormState, k: string) => (typeof s.values?.[k] === "string" ? (s.values[k] as string) : "");

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

/** Remove with a reason (kept in the audit log): a question (with its answers) or one answer. */
function RemoveForm({ kind, targetId }: { kind: "question" | "answer"; targetId: string }) {
  const [state, action, pending] = useActionState(kind === "question" ? removeQuestion : removeAnswer, {} as FormState);
  const err = state.errors?.reason;
  return (
    <form action={action} className="a-form mod-remove">
      <input type="hidden" name={kind === "question" ? "question_id" : "answer_id"} value={targetId} />
      <label className="a-field">
        Reason for removing
        <span className="a-hint">For cause: an advert, a personal attack, personal details, or off topic.</span>
        <textarea
          name="reason"
          className="a-input"
          rows={2}
          maxLength={500}
          defaultValue={v(state, "reason")}
          aria-invalid={err ? true : undefined}
        />
        {err && <span className="a-err">{err}</span>}
      </label>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Removing…" : kind === "question" ? "Remove question" : "Remove answer"}
      </Button>
      <Result state={state} />
    </form>
  );
}

/** A held question: Approve (it goes up, open for 14 days) or Remove with a reason. */
export function HeldQuestionActions({ questionId }: { questionId: string }) {
  const [state, action, pending] = useActionState(approveQuestion, {} as FormState);
  return (
    <div className="mod-actions">
      <form action={action} className="a-form">
        <input type="hidden" name="question_id" value={questionId} />
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Approving…" : "Approve"}
        </Button>
        <Result state={state} />
      </form>
      <RemoveForm kind="question" targetId={questionId} />
    </div>
  );
}

/** A reported question or answer: Remove with a reason, or Dismiss the reports (it stays up). */
export function ReportedActions({ targetType, targetId }: { targetType: "question" | "answer"; targetId: string }) {
  const [state, action, pending] = useActionState(dismissReports, {} as FormState);
  return (
    <div className="mod-actions">
      <RemoveForm kind={targetType} targetId={targetId} />
      <form action={action} className="a-form">
        <input type="hidden" name="target_type" value={targetType} />
        <input type="hidden" name="target_id" value={targetId} />
        <label className="a-field">
          <span>
            Note <span className="a-hint">(optional)</span>
          </span>
          <input name="note" className="a-input" maxLength={500} />
        </label>
        <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending}>
          {pending ? "Dismissing…" : "Dismiss reports"}
        </Button>
        <Result state={state} />
      </form>
    </div>
  );
}
