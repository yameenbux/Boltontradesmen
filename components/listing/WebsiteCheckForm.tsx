"use client";

import { useActionState, type ReactNode } from "react";
import { AlertIcon } from "@/components/auth/icons";
import { Turnstile } from "@/components/auth/Turnstile";
import { Button } from "@/components/ui/Button";
import { requestWebsiteCheck } from "@/app/(info)/website-check/actions";
import { HONEYPOT_FIELD, STARTED_FIELD } from "@/lib/listing-request";
import { CHECK_LIMITS, type CheckFormState } from "@/lib/website-check";

type Name = keyof typeof CHECK_LIMITS;

// UK numbers as people type them: digits, spaces, brackets, a + and dashes (the server checks the number itself).
const PHONE_PATTERN = "[\\d\\s\\(\\)+\\-]{10,20}";

function Field({
  name,
  label,
  hint,
  optional,
  error,
  children,
}: {
  name: Name;
  label: string;
  hint?: string;
  optional?: boolean;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {optional && <span className="opt"> (optional)</span>}
      </span>
      {hint && (
        <span id={`wc-${name}-hint`} className="hint">
          {hint}
        </span>
      )}
      {children}
      {error && (
        <span id={`wc-${name}-err`} className="field-err">
          {error}
        </span>
      )}
    </label>
  );
}

/**
 * The free website check request. The browser checks the required fields; the server checks everything again. A
 * hidden honeypot and the signed time the form was shown catch simple scripts; Turnstile (when configured) and a
 * daily limit per connection do the rest. Once sent, the form is replaced by the thank-you.
 */
export function WebsiteCheckForm({ started, captchaSiteKey }: { started: string; captchaSiteKey: string | null }) {
  const [state, action, pending] = useActionState(requestWebsiteCheck, {} as CheckFormState);

  if (state.ok) {
    return (
      <p role="status" className="form-done" data-testid="website-check-done">
        {state.message}
      </p>
    );
  }

  const props = (n: Name, { hint = false, required = true }: { hint?: boolean; required?: boolean } = {}) => ({
    name: n,
    className: "input",
    maxLength: CHECK_LIMITS[n],
    required,
    defaultValue: state.values?.[n] ?? "",
    "aria-invalid": state.errors?.[n] ? true : undefined,
    "aria-describedby":
      [hint ? `wc-${n}-hint` : null, state.errors?.[n] ? `wc-${n}-err` : null].filter(Boolean).join(" ") || undefined,
  });

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name={STARTED_FIELD} value={started} />
      {/* Honeypot: hidden from people and screen readers; anything typed here means a script filled the form. */}
      <div className="sr-only" aria-hidden="true">
        <label>
          Website
          <input name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <Field name="contact_name" label="Your name" error={state.errors?.contact_name}>
        <input {...props("contact_name")} autoComplete="name" />
      </Field>
      <Field name="business_name" label="Business name" error={state.errors?.business_name}>
        <input {...props("business_name")} autoComplete="organization" />
      </Field>
      <Field name="trade" label="Your trade" hint="For example plumber, electrician or roofer." error={state.errors?.trade}>
        <input {...props("trade", { hint: true })} autoComplete="off" />
      </Field>
      <Field name="phone" label="Mobile number" hint="We'll WhatsApp or call you with the results." error={state.errors?.phone}>
        <input
          {...props("phone", { hint: true })}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          pattern={PHONE_PATTERN}
          placeholder="07700 900123"
        />
      </Field>
      <Field name="email" label="Email" optional error={state.errors?.email}>
        <input
          {...props("email", { required: false })}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <Field
        name="link"
        label="Your website, Facebook page or Google listing"
        hint="Leave it empty if you haven't got one: we'll tell you where to start."
        optional
        error={state.errors?.link}
      >
        <input {...props("link", { hint: true, required: false })} inputMode="url" autoCapitalize="none" spellCheck={false} />
      </Field>

      {state.message && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}

      <Turnstile siteKey={captchaSiteKey} resetKey={state} />

      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Sending…" : "Get my free check"}
      </Button>
    </form>
  );
}
