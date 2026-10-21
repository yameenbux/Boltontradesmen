"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { verifyStep, type VerifyState } from "@/app/admin/verify/actions";

const initial: VerifyState = {};

/** The admin's second step: set up an authenticator app (first time), then its 6-digit code. */
export function VerifyForm({ hasAuthenticator }: { hasAuthenticator: boolean }) {
  const [state, action, pending] = useActionState(verifyStep, initial);
  const settingUp = !hasAuthenticator && !state.factorId;

  if (settingUp) {
    return (
      <form action={action} className="a-form">
        <p>
          The admin area needs a code from an authenticator app as well as your password. Install one on your phone
          (Google Authenticator, Microsoft Authenticator or 1Password all work), then press the button to get a QR
          code to scan.
        </p>
        <input type="hidden" name="intent" value="setup" />
        {state.message && (
          <p role="alert" className="a-err">
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Setting up…" : "Set up my authenticator"}
        </Button>
      </form>
    );
  }

  return (
    <form action={action} className="a-form" data-testid="admin-verify">
      {state.qr && (
        <div className="flex flex-col items-center gap-3" data-testid="admin-mfa-setup">
          <p>Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI SVG from Supabase, not a site image */}
          <img src={state.qr} alt="QR code for your authenticator app" width={200} height={200} />
          <p className="text-sm">
            Can&apos;t scan it? Enter this key in the app instead:{" "}
            <code className="break-all" data-testid="admin-mfa-secret">
              {state.secret}
            </code>
          </p>
        </div>
      )}
      {state.factorId && <input type="hidden" name="factorId" value={state.factorId} />}
      <label className="a-field">
        6-digit code
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          autoFocus
          className="a-input"
        />
      </label>
      {state.message && (
        <p role="alert" className="a-err">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
