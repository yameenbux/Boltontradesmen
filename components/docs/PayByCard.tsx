"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { payByCard } from "@/app/(platform)/d/[token]/actions";

/** "Pay £X by card": off to Stripe's secure checkout on the trader's own account. */
export function PayByCard({ token, label }: { token: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="pay-card">
      <Button
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            const r = await payByCard(token);
            if (r && !r.ok) setError(r.message);
          })
        }
      >
        {pending ? "Opening secure checkout…" : label}
      </Button>
      <p className="hint">Secure card payment by Stripe. The money goes straight to them.</p>
      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
