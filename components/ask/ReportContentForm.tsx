"use client";

import { useActionState } from "react";
import { AlertIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { reportQuestionContent } from "@/app/platform/ask/[id]/report/actions";
import type { FormState } from "@/lib/admin-shared";

/** The report form for a question or an answer (as components/review/ReportForm.tsx is for a review). */
export function ReportContentForm({
  questionId,
  answerId,
  backHref,
}: {
  questionId: string;
  answerId: string | null;
  backHref: string;
}) {
  const [state, action, pending] = useActionState(reportQuestionContent, {} as FormState);
  const err = state.errors?.note;
  const note = typeof state.values?.note === "string" ? state.values.note : "";

  if (state.ok) {
    return (
      <div className="report-done" aria-live="polite">
        <div className="done">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" />
            <path d="M30 52 44 65 71 37" />
          </svg>
          <h2 className="display">Report sent</h2>
          <p>{state.message}</p>
        </div>
        <Button href={backHref}>Back to the question</Button>
      </div>
    );
  }

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="question_id" value={questionId} />
      {answerId && <input type="hidden" name="answer_id" value={answerId} />}
      <label className="field">
        What&apos;s wrong with it?
        <span className="hint">
          For example: an advert, a personal attack, someone&apos;s phone number or personal details, or nothing to do
          with Bolton.
        </span>
        <textarea
          name="note"
          className="input textarea"
          rows={4}
          required
          minLength={5}
          maxLength={500}
          defaultValue={note}
          key={note}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? "q-report-err" : undefined}
        />
        {err && (
          <span id="q-report-err" className="field-err">
            {err}
          </span>
        )}
      </label>
      {state.message && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Sending…" : "Send report"}
      </Button>
      <p className="post-note">Reports go to the admin. A report doesn&apos;t take anything down on its own.</p>
    </form>
  );
}
