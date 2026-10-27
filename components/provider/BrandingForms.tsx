"use client";

import { useActionState, useState } from "react";
import { AlertIcon, TickIcon } from "@/components/auth/icons";
import { LogoPick } from "@/components/provider/LogoPick";
import { Button } from "@/components/ui/Button";
import { removeLogo, saveBrandColor, saveLogo } from "@/app/(platform)/provider/logo-actions";
import type { FormState } from "@/lib/admin-shared";
import { BRAND_COLORS, type BrandColor } from "@/lib/brand";

// The dashboard's "Your page's look": the logo (any plan) and, with Pro, the cover colour.

function Result({ state }: { state: FormState }) {
  if (!state.message) return null;
  return state.ok ? (
    <p role="status" className="form-ok">
      <TickIcon />
      {state.message}
    </p>
  ) : (
    <p role="alert" className="form-alert">
      <AlertIcon />
      {state.message}
    </p>
  );
}

/** Add or change the logo, and take it off. */
export function LogoForm({ providerId, slug, current }: { providerId: string; slug: string; current: string | null }) {
  const [state, action, pending] = useActionState(saveLogo, {} as FormState);
  const [rmState, rmAction, rmPending] = useActionState(removeLogo, {} as FormState);
  const [chosen, setChosen] = useState(false);
  return (
    <div className="branding-logo">
      <form action={action} className="auth-form">
        <input type="hidden" name="provider_id" value={providerId} />
        <input type="hidden" name="slug" value={slug} />
        <LogoPick
          id={`logo-${providerId}`}
          current={current}
          error={state.errors?.logo}
          onChange={(f) => setChosen(f !== null)}
          hint="Shown at the top of your page instead of your initials. A square image works best: JPEG, PNG or WebP."
        />
        <Result state={state} />
        <Button type="submit" disabled={pending || !chosen} aria-busy={pending}>
          {pending ? "Saving…" : current ? "Use this logo" : "Add to my page"}
        </Button>
      </form>
      {current && (
        <form action={rmAction} className="auth-form">
          <input type="hidden" name="provider_id" value={providerId} />
          <input type="hidden" name="slug" value={slug} />
          <Result state={rmState} />
          <Button type="submit" variant="secondary" disabled={rmPending} aria-busy={rmPending}>
            Remove my logo
          </Button>
        </form>
      )}
    </div>
  );
}

/** Pro: the colour of the band across the top of the page, or none. */
export function BrandColorForm({
  providerId,
  slug,
  current,
}: {
  providerId: string;
  slug: string;
  current: BrandColor | null;
}) {
  const [state, action, pending] = useActionState(saveBrandColor, {} as FormState);
  const name = `brand-${providerId}`;
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="provider_id" value={providerId} />
      <input type="hidden" name="slug" value={slug} />
      <fieldset className="swatch-group" aria-describedby={`${name}-hint`}>
        <legend className="avail-legend">Cover colour</legend>
        <span id={`${name}-hint`} className="hint">
          A band in your colour across the top of your page, behind your logo.
        </span>
        <div className="swatches">
          <label className="swatch swatch-none">
            <input type="radio" name="brand_color" value="" defaultChecked={!current} />
            <span>None</span>
          </label>
          {BRAND_COLORS.map((c) => (
            <label key={c.key} className="swatch" style={{ "--swatch": c.hex } as React.CSSProperties}>
              <input type="radio" name="brand_color" value={c.key} defaultChecked={current === c.key} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Result state={state} />
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save colour"}
      </Button>
    </form>
  );
}
