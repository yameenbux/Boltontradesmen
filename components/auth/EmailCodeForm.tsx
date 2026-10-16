"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { AlertIcon, TickIcon } from "@/components/auth/icons";
import { Turnstile } from "@/components/auth/Turnstile";
import { Button } from "@/components/ui/Button";
import { requestEmailCode, verifyEmailCode, type EmailSignInState } from "@/app/platform/sign-in/actions";

type State = EmailSignInState & { notice?: string };

/**
 * Two steps on one screen: email address → 6-digit code. "Send a new code" and "Use a different address"
 * submit the same form with an intent, so the browser's own validation never blocks them. A refused resend
 * (say, "wait a minute") keeps the code step: the code already sent still works.
 */
async function step(prev: State, fd: FormData): Promise<State> {
  const intent = fd.get("intent");
  if (intent === "change") return { step: "email", next: prev.next, email: prev.email ?? "" };
  if (intent === "resend") {
    const res = await requestEmailCode(prev, fd);
    return res.step === "code"
      ? { ...res, notice: "We've sent you a new code." }
      : { step: "code", email: prev.email, next: prev.next, error: res.error };
  }
  if (prev.step === "code") return verifyEmailCode(prev, fd);
  return requestEmailCode(prev, fd);
}

/**
 * The email-code sign-in, owning the card's heading. `before` (Continue with Google and the divider) shows
 * only on the first step.
 */
export function EmailCodeForm({
  next,
  title,
  before,
  captchaSiteKey = null,
}: {
  next: string;
  title: string;
  before?: ReactNode;
  /** Cloudflare Turnstile's site key, or null when it's off. Needed for "Email me a code" and "Send a new code". */
  captchaSiteKey?: string | null;
}) {
  const [state, action, pending] = useActionState(step, { step: "email", next });
  const code = useRef<HTMLInputElement>(null);
  const onCode = state.step === "code";

  // Moving to the code step: put the cursor in the code box so the keyboard (and one-time-code autofill) is ready.
  useEffect(() => {
    if (onCode) code.current?.focus();
  }, [onCode]);

  return (
    <>
      <div>
        <p className="eyebrow">Bolton Vouched</p>
        <h1 id="signin-title">{onCode ? "Check your email" : title}</h1>
        {onCode ? (
          <p className="lede" aria-live="polite">
            We&apos;ve sent a 6-digit code to <b className="addr">{state.email}</b>. It can take a minute — check your
            spam folder too.
          </p>
        ) : (
          <p className="lede">Continue with Google, or we&apos;ll email you a code. No password to remember.</p>
        )}
      </div>

      {!onCode && before}

      <form action={action} className="auth-form">
        <input type="hidden" name="next" value={state.next} />
        {onCode ? (
          <>
            <input type="hidden" name="email" value={state.email ?? ""} />
            <label className="field">
              6-digit code
              <input
                ref={code}
                key="code"
                name="code"
                className="input input-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                placeholder="······"
                required
                aria-invalid={state.error ? true : undefined}
                aria-describedby={state.error ? "email-signin-error" : undefined}
              />
            </label>
          </>
        ) : (
          <label className="field">
            Your email address
            <input
              key="email"
              name="email"
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@example.com"
              defaultValue={state.email ?? ""}
              required
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? "email-signin-error" : undefined}
            />
          </label>
        )}

        {state.error && (
          <p role="alert" id="email-signin-error" className="form-alert">
            <AlertIcon />
            {state.error}
          </p>
        )}
        {!state.error && state.notice && (
          <p role="status" className="form-ok">
            <TickIcon />
            {state.notice}
          </p>
        )}

        <Turnstile siteKey={captchaSiteKey} resetKey={state} />

        <Button type="submit" disabled={pending} aria-busy={pending}>
          {onCode ? (pending ? "Checking…" : "Sign in") : pending ? "Sending…" : "Email me a code"}
        </Button>

        {onCode && (
          <div className="text-row">
            <button type="submit" name="intent" value="resend" formNoValidate className="text-btn" disabled={pending}>
              Send a new code
            </button>
            <button type="submit" name="intent" value="change" formNoValidate className="text-btn" disabled={pending}>
              Use a different address
            </button>
          </div>
        )}
      </form>
    </>
  );
}
