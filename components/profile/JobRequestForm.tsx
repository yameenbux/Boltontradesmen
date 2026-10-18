"use client";

import { useActionState, useState, type FormEvent, type ReactNode } from "react";
import { AlertIcon, ChevronDown } from "@/components/auth/icons";
import { Turnstile } from "@/components/auth/Turnstile";
import { Button } from "@/components/ui/Button";
import { JOB_BODY_MIN, JOB_ERRORS, JOB_LIMITS, type JobFormState } from "@/lib/job-request";
import { HONEYPOT_FIELD, STARTED_FIELD } from "@/lib/listing-request";

type Name = "name" | "phone" | "email" | "district" | "body";

// UK numbers as people type them: digits, spaces, brackets, a + and dashes (the server checks the number itself).
const PHONE_PATTERN = "[\\d\\s\\(\\)+\\-]{10,20}";
const NAMES: readonly string[] = ["name", "phone", "email", "district", "body"];
const isName = (n: string): n is Name => NAMES.includes(n);

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
        <span id={`rq-${name}-hint`} className="hint">
          {hint}
        </span>
      )}
      {children}
      {error && (
        <span id={`rq-${name}-err`} className="field-err">
          {error}
        </span>
      )}
    </label>
  );
}

/**
 * "Request a quote": the job, the resident's name, number, optional email and area. Same pattern as the "Get
 * listed" form: the browser checks first and the message shows under the field; the server checks everything again.
 */
export function JobRequestForm({
  action,
  started,
  captchaSiteKey,
  areas,
}: {
  action: (prev: JobFormState, fd: FormData) => Promise<JobFormState>;
  started: string;
  captchaSiteKey: string | null;
  areas: readonly string[];
}) {
  const [state, formAction, pending] = useActionState(action, {} as JobFormState);
  const [local, setLocal] = useState<Partial<Record<Name, string>>>({});
  const [answered, setAnswered] = useState(state);
  if (answered !== state) {
    setAnswered(state);
    setLocal({});
  }
  const errorFor = (n: Name) => local[n] ?? state.errors?.[n];

  function onInvalid(e: FormEvent<HTMLFormElement>) {
    const el = e.target as HTMLInputElement;
    if (!isName(el.name)) return;
    const n = el.name;
    e.preventDefault();
    if (el.form?.querySelector(":invalid") === el) el.focus();
    setLocal((prev) => ({ ...prev, [n]: JOB_ERRORS[n] }));
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

  const described = (n: Name, hint: boolean) =>
    [hint ? `rq-${n}-hint` : null, errorFor(n) ? `rq-${n}-err` : null].filter(Boolean).join(" ") || undefined;
  const common = (n: Name, hint = false) => ({
    name: n,
    defaultValue: state.values?.[n] ?? "",
    "aria-invalid": errorFor(n) ? true : undefined,
    "aria-describedby": described(n, hint),
  });

  return (
    <form action={formAction} className="auth-form" aria-label="Request a quote" onInvalidCapture={onInvalid} onInputCapture={onInput}>
      <input type="hidden" name={STARTED_FIELD} value={started} />
      {/* Honeypot: hidden from people and screen readers; anything typed here means a script filled the form. */}
      <div className="sr-only" aria-hidden="true">
        <label>
          Website
          <input name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <Field name="body" label="The job" hint="What needs doing, and roughly when. Photos can wait for their reply." error={errorFor("body")}>
        <textarea {...common("body", true)} className="input textarea" rows={5} required minLength={JOB_BODY_MIN} maxLength={JOB_LIMITS.body} />
      </Field>
      <Field name="district" label="Where?" error={errorFor("district")}>
        <span className="select">
          <select {...common("district")} className="input" required key={state.values?.district ?? ""}>
            <option value="" disabled>
              Choose your area
            </option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <ChevronDown />
        </span>
      </Field>
      <Field name="name" label="Your name" error={errorFor("name")}>
        <input {...common("name")} className="input" required minLength={2} maxLength={JOB_LIMITS.name} autoComplete="name" />
      </Field>
      <Field name="phone" label="Your number" hint="They'll call or WhatsApp you on this." error={errorFor("phone")}>
        <input
          {...common("phone", true)}
          className="input"
          required
          maxLength={JOB_LIMITS.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          pattern={PHONE_PATTERN}
          placeholder="07700 900123"
        />
      </Field>
      <Field name="email" label="Email" optional error={errorFor("email")}>
        <input
          {...common("email")}
          className="input"
          maxLength={JOB_LIMITS.email}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>

      {state.message && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <Turnstile siteKey={captchaSiteKey} resetKey={state} />
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
