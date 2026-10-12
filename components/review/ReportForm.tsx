"use client";

import { useActionState } from "react";
import { AlertIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { reportReview } from "@/app/platform/report/[reviewId]/actions";
import type { FormState } from "@/lib/admin-shared";

export function ReportForm({
  reviewId,
  backHref,
  backLabel,
}: {
  reviewId: string;
  backHref: string;
  backLabel: string;
}) {
  const [state, action, pending] = useActionState(reportReview, {} as FormState);
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
        <Button href={backHref}>Back to {backLabel}</Button>
      </div>
    );
  }

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="review_id" value={reviewId} />
      <label className="field">
        What&apos;s wrong with this review?
        <span className="hint">
          For example: not a real customer, about a different business, abusive, or it shares someone&apos;s personal
          details.
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
          aria-describedby={err ? "report-note-err" : undefined}
        />
        {err && (
          <span id="report-note-err" className="field-err">
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
      <p className="post-note">Reports go to the admin. A report doesn&apos;t change the review on its own.</p>
    </form>
  );
}
