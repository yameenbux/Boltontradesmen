"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { answerQuote } from "@/app/platform/d/[token]/actions";

/** Accept or decline a quote, from the customer's link. */
export function CustomerDocActions({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const answer = (accept: boolean) =>
    start(async () => {
      const r = await answerQuote(token, accept);
      setNote({ ok: r.ok, text: r.message });
    });
  if (note?.ok) {
    return (
      <p className="form-ok" role="status">
        {note.text}
      </p>
    );
  }
  return (
    <div className="doc-actions">
      <Button disabled={pending} onClick={() => answer(true)}>
        Accept this quote
      </Button>
      <Button variant="secondary" disabled={pending} onClick={() => answer(false)}>
        Decline
      </Button>
      {note && (
        <p className="form-alert" role="alert">
          {note.text}
        </p>
      )}
    </div>
  );
}
