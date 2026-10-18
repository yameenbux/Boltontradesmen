"use client";

import { useActionState } from "react";
import { AlertIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import type { FormState } from "@/lib/admin-shared";

export type AlertSettings = {
  sms: string | null;
  email: string | null;
  sms_on: boolean;
  email_on: boolean;
  question_alerts: boolean;
  custom_sms: string | null;
  custom_email: string | null;
};

const v = (state: FormState, k: string, fallback: string) =>
  typeof state.values?.[k] === "string" ? (state.values[k] as string) : fallback;

/** Where a Pro trader's alerts go (empty = the listing's mobile and the account's email) and which are on. */
export function AlertSettingsForm({
  action,
  settings,
  defaultSms,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  settings: AlertSettings;
  defaultSms: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const err = state.errors ?? {};
  return (
    <form action={formAction} className="auth-form" aria-label="Alert settings">
      <label className="confirm-box">
        <input type="checkbox" name="sms_on" defaultChecked={settings.sms_on} />
        <span>Text me</span>
      </label>
      <label className="field">
        <span>
          Mobile for texts<span className="opt"> (optional)</span>
        </span>
        <span className="hint">{defaultSms ? `Leave empty to use ${defaultSms}.` : "Your listing's number isn't a mobile, so add one here for texts."}</span>
        <input
          name="sms"
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="07700 900123"
          defaultValue={v(state, "sms", settings.custom_sms ?? "")}
          aria-invalid={err.sms ? true : undefined}
        />
        {err.sms && <span className="field-err">{err.sms}</span>}
      </label>
      <label className="confirm-box">
        <input type="checkbox" name="email_on" defaultChecked={settings.email_on} />
        <span>Email me</span>
      </label>
      <label className="field">
        <span>
          Email for alerts<span className="opt"> (optional)</span>
        </span>
        <span className="hint">{settings.email && !settings.custom_email ? `Leave empty to use ${settings.email}.` : "Where alert emails go."}</span>
        <input
          name="email"
          className="input"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={v(state, "email", settings.custom_email ?? "")}
          aria-invalid={err.email ? true : undefined}
        />
        {err.email && <span className="field-err">{err.email}</span>}
      </label>
      <label className="confirm-box">
        <input type="checkbox" name="question_alerts" defaultChecked={settings.question_alerts} />
        <span>Tell me when someone in my areas asks Bolton for my trade</span>
      </label>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "form-ok" : "form-alert"}>
          {!state.ok && <AlertIcon />}
          {state.message}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save alert settings"}
      </Button>
    </form>
  );
}
