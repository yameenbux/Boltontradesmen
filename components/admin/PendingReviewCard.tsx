"use client";

import { useActionState } from "react";
import { ModerationReview, type AdminFlag, type AdminReview } from "@/components/admin/ModerationReview";
import { Button } from "@/components/ui/Button";
import { approveReview, removeReview } from "@/app/admin/(protected)/reviews/actions";
import type { FormState } from "@/lib/admin-shared";

export type PendingReview = AdminReview & { flags: AdminFlag[]; sign_in_kind: string | null };

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

/**
 * A review held for approval (an email-only account's): who wrote it and how they signed in, the review, any
 * automatic flags, then Approve, or Remove with a reason that goes into the audit log.
 */
export function PendingReviewCard({ review: r, now }: { review: PendingReview; now: Date }) {
  const [approved, approve, approving] = useActionState(approveReview, {} as FormState);
  const [removed, remove, removing] = useActionState(removeReview, {} as FormState);
  const err = removed.errors?.reason;
  const reason = typeof removed.values?.reason === "string" ? (removed.values.reason as string) : "";
  const done = approved.ok || removed.ok;
  return (
    <article className="a-card mod-card" aria-label={`Review of ${r.business_name} by ${r.reviewer_name}`}>
      <ModerationReview review={r} flags={r.flags} ageNow={now} />
      <p className="mod-how">
        {r.sign_in_kind === "email" ? "Signed in with an email code" : "Signed in with Google"}
      </p>
      {done ? (
        <Result state={approved.ok ? approved : removed} />
      ) : (
        <div className="mod-actions">
          <form action={approve} className="a-form">
            <input type="hidden" name="review_id" value={r.id} />
            <Button type="submit" disabled={approving || removing} aria-busy={approving}>
              {approving ? "Approving…" : "Approve"}
            </Button>
            <Result state={approved} />
          </form>
          <form action={remove} className="a-form mod-remove">
            <input type="hidden" name="review_id" value={r.id} />
            <label className="a-field">
              Reason for removing
              <span className="a-hint">Only for cause: fake, not a real customer, abusive, unlawful or personal data.</span>
              <textarea
                name="reason"
                className="a-input"
                rows={2}
                maxLength={500}
                defaultValue={reason}
                aria-invalid={err ? true : undefined}
              />
              {err && <span className="a-err">{err}</span>}
            </label>
            <Button type="submit" variant="secondary" disabled={approving || removing} aria-busy={removing}>
              {removing ? "Removing…" : "Remove"}
            </Button>
            <Result state={removed} />
          </form>
        </div>
      )}
    </article>
  );
}
