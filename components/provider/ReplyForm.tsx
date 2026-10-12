"use client";

import { useActionState, useState } from "react";
import { AlertIcon, TickIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { saveReply } from "@/app/platform/provider/actions";
import type { FormState } from "@/lib/admin-shared";
import { REPLY_MAX } from "@/lib/review-form";

export type ExistingReply = {
  body: string;
  removed: boolean;
  editable: boolean;
  /** "26 October 2026": the last day it can be edited. */
  editableUntil: string;
};

/** The provider's one reply to a review: write it, then edit it for 14 days. */
export function ReplyForm({
  reviewId,
  reviewerName,
  reply,
}: {
  reviewId: string;
  reviewerName: string;
  reply: ExistingReply | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const res = await saveReply(prev, fd);
    if (res.ok) setEditing(false);
    return res;
  }, {} as FormState);
  const [body, setBody] = useState(reply?.body ?? "");
  const err = state.errors?.body;
  const fieldId = `reply-${reviewId}`;

  if (!reply && !editing) {
    return (
      <button type="button" className="reply-open press" onClick={() => setEditing(true)}>
        <ReplyIcon />
        Reply to {reviewerName.split(" ")[0]}
      </button>
    );
  }

  if (reply && !editing) {
    return (
      <div className="reply-box">
        {state.ok && state.message && (
          <p role="status" className="form-ok">
            <TickIcon />
            {state.message}
          </p>
        )}
        <div className="reply">
          <b>Your reply</b>
          <p>{reply.body}</p>
        </div>
        {reply.removed ? (
          <p className="closed">
            <Pill tone="muted">Removed</Pill>
            <span>The admin took this reply down, so it isn&apos;t shown.</span>
          </p>
        ) : reply.editable ? (
          <div className="reply-edit-row">
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setBody(reply.body);
                setEditing(true);
              }}
            >
              Edit reply
            </button>
            <small>You can edit it until {reply.editableUntil}.</small>
          </div>
        ) : (
          <p className="closed">
            <Pill tone="muted">Edit closed</Pill>
            <span>Replies can be edited for 14 days.</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="reply-form">
      <input type="hidden" name="review_id" value={reviewId} />
      <label className="field" htmlFor={fieldId}>
        Your reply
      </label>
      <textarea
        id={fieldId}
        name="body"
        className="input textarea"
        rows={3}
        maxLength={REPLY_MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Thank ${reviewerName.split(" ")[0]}, or give your side politely.`}
        aria-invalid={err ? true : undefined}
        autoFocus
      />
      <span className="counter" data-near={body.length > REPLY_MAX - 40 || undefined}>
        {body.length}/{REPLY_MAX}
      </span>
      {err && <span className="field-err">{err}</span>}
      {state.message && !state.ok && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <div className="reply-actions">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Posting…" : reply ? "Save reply" : "Post reply"}
        </Button>
        <button type="button" className="text-btn" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const ReplyIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M9 17 4 12l5-5" />
    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
  </svg>
);
