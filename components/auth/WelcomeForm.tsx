"use client";

import { useActionState, useState } from "react";
import { AlertIcon, ChevronDown } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { completeOnboarding } from "@/app/platform/welcome/actions";
import type { FormState } from "@/lib/admin-shared";
import { BL_DISTRICTS, OTHER_DISTRICT } from "@/lib/districts";

function preview(first: string, surname: string): string | null {
  const f = first.trim().replace(/\s+/g, " ");
  const s = surname.trim();
  if (!f || !s) return null;
  const name = f.replace(/(^|[ -])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase("en-GB"));
  return `${name} ${Array.from(s)[0].toLocaleUpperCase("en-GB")}.`;
}

function initialsOf(name: string): string {
  const [first, last] = name.split(" ");
  return (Array.from(first)[0] + (last ? Array.from(last)[0] : "")).toLocaleUpperCase("en-GB");
}

/** `askIntent`: show "looking for a trader / I'm a trader" (only when the sign-in had no particular destination). */
export function WelcomeForm({ next, askIntent }: { next: string; askIntent: boolean }) {
  const [state, action, pending] = useActionState(completeOnboarding, {} as FormState);
  const v = (k: string) => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : "");
  const [first, setFirst] = useState(v("first_name"));
  const [surname, setSurname] = useState(v("surname"));
  const [intent, setIntent] = useState(v("intent"));
  const shown = preview(first, surname);
  const err = state.errors ?? {};

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="next" value={next} />
      {askIntent && (
        <fieldset className="avail-opts intent-opts" aria-describedby={err.intent ? "intent-err" : undefined}>
          <legend className="avail-legend">What brings you to Bolton Vouched?</legend>
          <label className="avail-opt">
            <input
              type="radio"
              name="intent"
              value="customer"
              required
              checked={intent === "customer"}
              onChange={() => setIntent("customer")}
            />
            <span>
              I&apos;m looking for a trader
              <small>Find someone, ask Bolton, leave reviews</small>
            </span>
          </label>
          <label className="avail-opt">
            <input type="radio" name="intent" value="trader" checked={intent === "trader"} onChange={() => setIntent("trader")} />
            <span>
              I&apos;m a trader
              <small>Get listed, or manage your listing</small>
            </span>
          </label>
          {err.intent && (
            <span id="intent-err" className="field-err">
              {err.intent}
            </span>
          )}
        </fieldset>
      )}
      <label className="field">
        First name
        <input
          name="first_name"
          className="input"
          autoComplete="given-name"
          autoCapitalize="words"
          maxLength={30}
          required
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          aria-invalid={err.first_name ? true : undefined}
        />
        {err.first_name && <span className="field-err">{err.first_name}</span>}
      </label>
      <label className="field">
        Surname
        <span className="hint">Only the first letter is shown</span>
        <input
          name="surname"
          className="input"
          autoComplete="family-name"
          autoCapitalize="words"
          maxLength={40}
          required
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
          aria-invalid={err.surname ? true : undefined}
        />
        {err.surname && <span className="field-err">{err.surname}</span>}
      </label>
      {shown && (
        <div className="preview-name" aria-live="polite">
          <span className="avatar" aria-hidden="true">
            {initialsOf(shown)}
          </span>
          <span>
            Your reviews will show
            <b>{shown}</b>
          </span>
        </div>
      )}
      <label className="field">
        Your area
        <span className="hint">The start of your postcode. It&apos;s never shown on the site.</span>
        <span className="select">
          <select
            name="district"
            className="input"
            required
            defaultValue={v("district")}
            key={v("district")}
            aria-invalid={err.district ? true : undefined}
          >
            <option value="" disabled>
              Choose your area
            </option>
            {BL_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value={OTHER_DISTRICT}>Somewhere else</option>
          </select>
          <ChevronDown />
        </span>
        {err.district && <span className="field-err">{err.district}</span>}
      </label>
      {state.message && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save and continue"}
      </Button>
    </form>
  );
}
