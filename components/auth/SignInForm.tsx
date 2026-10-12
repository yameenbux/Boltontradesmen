"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertIcon, TickIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { requestCode, verifyCode, type SignInState } from "@/app/platform/sign-in/actions";
import { nationalMobile } from "@/lib/phone-format";

type State = SignInState & { notice?: string };

/**
 * Two steps on one screen: mobile number → 6-digit code. "Send a new code" and "Use a different number"
 * submit the same form with an intent, so the browser's own validation never blocks them.
 */
async function step(prev: State, fd: FormData): Promise<State> {
  const intent = fd.get("intent");
  if (intent === "change")
    return { step: "phone", next: prev.next, phone: prev.phone ? nationalMobile(prev.phone) : "" };
  if (intent === "resend") {
    const res = await requestCode(prev, fd);
    return res.step === "code" ? { ...res, notice: "We've sent you a new code." } : res;
  }
  if (prev.step === "code") return verifyCode(prev, fd);
  return requestCode(prev, fd);
}

export function SignInForm({ next, title }: { next: string; title: string }) {
  const [state, action, pending] = useActionState(step, { step: "phone", next });
  const code = useRef<HTMLInputElement>(null);
  const onCode = state.step === "code";

  // Moving to the code step: put the cursor in the code box so the keyboard (and the SMS autofill) is ready.
  useEffect(() => {
    if (onCode) code.current?.focus();
  }, [onCode]);

  return (
    <>
      <div>
        <p className="eyebrow">Bolton Vouched</p>
        <h1 id="signin-title">{onCode ? "Check your texts" : title}</h1>
        {onCode ? (
          <p className="lede" aria-live="polite">
            We&apos;ve sent a 6-digit code to <b>{nationalMobile(state.phone ?? "")}</b>
          </p>
        ) : (
          <p className="lede">We&apos;ll text you a code. No password to remember.</p>
        )}
      </div>
      <form action={action} className="auth-form">
        <input type="hidden" name="next" value={state.next} />
        {onCode ? (
          <>
            <input type="hidden" name="phone" value={state.phone ?? ""} />
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
                aria-describedby={state.error ? "signin-error" : undefined}
              />
            </label>
          </>
        ) : (
          <label className="field">
            Your mobile number
            <span className="hint">A UK mobile, like 07700 900123</span>
            <input
              key="phone"
              name="phone"
              className="input"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              defaultValue={state.phone ?? ""}
              required
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? "signin-error" : undefined}
            />
          </label>
        )}

        {state.error && (
          <p role="alert" id="signin-error" className="form-alert">
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

        <Button type="submit" disabled={pending} aria-busy={pending}>
          {onCode ? (pending ? "Checking…" : "Sign in") : pending ? "Sending…" : "Send me a code"}
        </Button>

        {onCode && (
          <div className="text-row">
            <button type="submit" name="intent" value="resend" formNoValidate className="text-btn" disabled={pending}>
              Send a new code
            </button>
            <button type="submit" name="intent" value="change" formNoValidate className="text-btn" disabled={pending}>
              Use a different number
            </button>
          </div>
        )}
      </form>
    </>
  );
}
