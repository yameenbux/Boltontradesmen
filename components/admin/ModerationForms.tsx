"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import {
  checkProof,
  clearReview,
  removeReply,
  removeReview,
  resolveFlag,
} from "@/app/admin/(protected)/reviews/actions";
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

/** Clear check (only while under check) and Remove, which needs a reason that goes into the audit log. */
export function ReviewActions({ reviewId, underCheck }: { reviewId: string; underCheck: boolean }) {
  const [cleared, clear, clearing] = useActionState(clearReview, {} as FormState);
  const [removed, remove, removing] = useActionState(removeReview, {} as FormState);
  const err = removed.errors?.reason;
  return (
    <div className="mod-actions">
      {underCheck && (
        <form action={clear} className="a-form">
          <input type="hidden" name="review_id" value={reviewId} />
          <Button type="submit" variant="secondary" disabled={clearing} aria-busy={clearing}>
            {clearing ? "Clearing…" : "Clear check"}
          </Button>
          <Result state={cleared} />
        </form>
      )}
      <form action={remove} className="a-form mod-remove">
        <input type="hidden" name="review_id" value={reviewId} />
        <label className="a-field">
          Reason for removing
          <span className="a-hint">Only for cause: fake, not a real customer, abusive, unlawful or personal data.</span>
          <textarea
            name="reason"
            className="a-input"
            rows={2}
            maxLength={500}
            defaultValue={v(removed, "reason")}
            aria-invalid={err ? true : undefined}
          />
          {err && <span className="a-err">{err}</span>}
        </label>
        <Button type="submit" disabled={removing} aria-busy={removing}>
          {removing ? "Removing…" : "Remove review"}
        </Button>
        <Result state={removed} />
      </form>
    </div>
  );
}

export function FlagActions({ flagIds }: { flagIds: string[] }) {
  const [state, action, pending] = useActionState(resolveFlag, {} as FormState);
  const all = flagIds.length > 1 ? " all" : "";
  return (
    <form action={action} className="a-form">
      {flagIds.map((f) => (
        <input key={f} type="hidden" name="flag_id" value={f} />
      ))}
      <label className="a-field">
        <span>
          Note <span className="a-hint">(optional)</span>
        </span>
        <input name="note" className="a-input" maxLength={500} />
      </label>
      <div className="a-actions">
        <Button type="submit" name="outcome" value="resolved" disabled={pending}>
          Resolve{all}
        </Button>
        <Button type="submit" name="outcome" value="dismissed" variant="secondary" disabled={pending}>
          Dismiss{all}
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

/** Accept → the review shows "Verified job". Reject needs a note. */
export function ProofActions({ proofId }: { proofId: string }) {
  const [state, action, pending] = useActionState(checkProof, {} as FormState);
  const err = state.errors?.note;
  return (
    <form action={action} className="a-form">
      <input type="hidden" name="proof_id" value={proofId} />
      <label className="a-field">
        <span>
          Note <span className="a-hint">(needed to reject)</span>
        </span>
        <input
          name="note"
          className="a-input"
          maxLength={500}
          defaultValue={v(state, "note")}
          aria-invalid={err ? true : undefined}
        />
        {err && <span className="a-err">{err}</span>}
      </label>
      <div className="a-actions">
        <Button type="submit" name="outcome" value="accepted" disabled={pending}>
          Accept: Verified job
        </Button>
        <Button type="submit" name="outcome" value="rejected" variant="secondary" disabled={pending}>
          Reject
        </Button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function RemoveReplyForm({ replyId }: { replyId: string }) {
  const [state, action, pending] = useActionState(removeReply, {} as FormState);
  const err = state.errors?.reason;
  return (
    <form action={action} className="a-form">
      <input type="hidden" name="reply_id" value={replyId} />
      <label className="a-field">
        Reason for removing the reply
        <textarea name="reason" className="a-input" rows={2} maxLength={500} aria-invalid={err ? true : undefined} />
        {err && <span className="a-err">{err}</span>}
      </label>
      <Button type="submit" disabled={pending}>
        Remove reply
      </Button>
      <Result state={state} />
    </form>
  );
}
