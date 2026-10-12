"use client";

import { useActionState, useState, type FormEvent, type ReactNode } from "react";
import { AlertIcon } from "@/components/auth/icons";
import { Turnstile } from "@/components/auth/Turnstile";
import { Button } from "@/components/ui/Button";
import { requestListing } from "@/app/(info)/get-listed/actions";
import {
  HONEYPOT_FIELD,
  LISTING_ERRORS,
  LISTING_LIMITS,
  STARTED_FIELD,
  type ListingFormState,
} from "@/lib/listing-request";

type Name = keyof typeof LISTING_LIMITS | "permission";
type TextName = Exclude<Name, "permission">;

// UK numbers as people type them: digits, spaces, brackets, a + and dashes (the server checks the number itself).
const PHONE_PATTERN = "[\\d\\s\\(\\)+\\-]{10,20}";

const isName = (n: string): n is Name => n in LISTING_LIMITS || n === "permission";

function FieldError({ name, error }: { name: Name; error: string | undefined }) {
  if (!error) return null;
  return (
    <span id={`gl-${name}-err`} className="field-err">
      {error}
    </span>
  );
}

function Field({
  name,
  label,
  hint,
  optional,
  error,
  children,
}: {
  name: TextName;
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
        <span id={`gl-${name}-hint`} className="hint">
          {hint}
        </span>
      )}
      {children}
      <FieldError name={name} error={error} />
    </label>
  );
}

/**
 * The "Get listed" request. The browser checks each field first (required, lengths, number and email shape) and
 * the message appears under the field instead of the browser's bubble; the server checks everything again. A
 * hidden honeypot field and the signed time the form was shown catch simple scripts; Turnstile (when configured)
 * and the database's limits do the rest.
 */
export function GetListedForm({
  started,
  captchaSiteKey,
  trades,
  areas,
}: {
  started: string;
  captchaSiteKey: string | null;
  trades: string[];
  areas: readonly string[];
}) {
  const [state, action, pending] = useActionState(requestListing, {} as ListingFormState);
  // Messages from the browser's own checks; cleared as the person types, and when the server answers.
  const [local, setLocal] = useState<Partial<Record<Name, string>>>({});
  const [answered, setAnswered] = useState(state);
  if (answered !== state) {
    setAnswered(state);
    setLocal({});
  }

  const errorFor = (n: Name) => local[n] ?? state.errors?.[n];

  function onInvalid(e: FormEvent<HTMLFormElement>) {
    const el = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (!isName(el.name)) return;
    const n = el.name;
    e.preventDefault();
    // The browser no longer moves to the first wrong field by itself, so do it here.
    if (el.form?.querySelector(":invalid") === el) el.focus();
    setLocal((prev) => ({ ...prev, [n]: LISTING_ERRORS[n] }));
  }

  function onInput(e: FormEvent<HTMLFormElement>) {
    const n = (e.target as HTMLInputElement).name;
    if (!isName(n) || !local[n]) return;
    setLocal((prev) => {
      const next = { ...prev };
      delete next[n];
      return next;
    });
  }

  // The props every text field shares. A failed submit refills it with what was sent (React resets the form to
  // these defaults after the action answers).
  const props = (n: TextName, { hint = false, required = true }: { hint?: boolean; required?: boolean } = {}) => ({
    name: n,
    className: "input",
    maxLength: LISTING_LIMITS[n],
    required,
    defaultValue: state.values?.[n] ?? "",
    "aria-invalid": errorFor(n) ? true : undefined,
    "aria-describedby":
      [hint ? `gl-${n}-hint` : null, errorFor(n) ? `gl-${n}-err` : null].filter(Boolean).join(" ") || undefined,
  });

  return (
    <form action={action} className="auth-form" onInvalidCapture={onInvalid} onInputCapture={onInput}>
      <input type="hidden" name={STARTED_FIELD} value={started} />
      {/* Honeypot: hidden from people and screen readers; anything typed here means a script filled the form. */}
      <div className="sr-only" aria-hidden="true">
        <label>
          Website
          <input name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <Field
        name="business_name"
        label="Business name"
        hint="As customers know you. Your own name is fine if you trade under it."
        error={errorFor("business_name")}
      >
        <input {...props("business_name", { hint: true })} autoComplete="organization" />
      </Field>
      <Field name="contact_name" label="Your name" error={errorFor("contact_name")}>
        <input {...props("contact_name")} autoComplete="name" />
      </Field>
      <Field name="trade" label="Your trade" hint="For example plumber, electrician or dog groomer." error={errorFor("trade")}>
        <input {...props("trade", { hint: true })} list={trades.length ? "gl-trades" : undefined} autoComplete="off" />
      </Field>
      {trades.length > 0 && (
        <datalist id="gl-trades">
          {trades.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
      <Field
        name="area"
        label="Areas you cover"
        hint="Postcode districts or places, like BL1 to BL3 or Farnworth."
        optional
        error={errorFor("area")}
      >
        <input {...props("area", { hint: true, required: false })} list="gl-areas" autoComplete="off" />
      </Field>
      <datalist id="gl-areas">
        {areas.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      <Field
        name="phone"
        label="Mobile number"
        hint="We'll WhatsApp or call you on this. A landline is fine too."
        error={errorFor("phone")}
      >
        <input
          {...props("phone", { hint: true })}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          pattern={PHONE_PATTERN}
          placeholder="07700 900123"
        />
      </Field>
      <Field name="email" label="Email" hint="Only if you'd like us to email you as well." optional error={errorFor("email")}>
        <input
          {...props("email", { hint: true, required: false })}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <Field
        name="message"
        label="Anything else?"
        hint="What you specialise in, or the best time to call."
        optional
        error={errorFor("message")}
      >
        <textarea {...props("message", { hint: true, required: false })} className="input textarea" rows={4} />
      </Field>

      <label className={`confirm-box${errorFor("permission") ? " has-err" : ""}`}>
        <input
          type="checkbox"
          name="permission"
          value="yes"
          required
          defaultChecked={state.values?.permission === "yes"}
          aria-invalid={errorFor("permission") ? true : undefined}
          aria-describedby={errorFor("permission") ? "gl-permission-err" : undefined}
        />
        <span>I&apos;m the owner or I have their permission, and you can contact me about a listing.</span>
      </label>
      <FieldError name="permission" error={errorFor("permission")} />

      {state.message && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}

      <Turnstile siteKey={captchaSiteKey} resetKey={state} />

      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Sending…" : "Send my request"}
      </Button>
    </form>
  );
}
