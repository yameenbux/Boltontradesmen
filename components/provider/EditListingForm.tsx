"use client";

import { useActionState, useState } from "react";
import { AlertIcon, TickIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { saveMyListing } from "@/app/platform/provider/actions";
import type { FormState } from "@/lib/admin-shared";
import { BL_DISTRICTS } from "@/lib/districts";
import { BIO_MAX } from "@/lib/listing-edit";

/** The trader's description (300 characters) and the areas they cover. Categories are shown, not edited. */
export function EditListingForm({
  providerId,
  bio,
  areas,
}: {
  providerId: string;
  bio: string | null;
  areas: string[];
}) {
  const [state, action, pending] = useActionState(saveMyListing, {} as FormState);
  const [text, setText] = useState(bio ?? "");
  const saved = state.values;
  const picked = new Set(
    Array.isArray(saved?.areas) ? saved.areas : areas.filter((a) => BL_DISTRICTS.includes(a)),
  );
  const length = [...text].length;
  const bioErr = state.errors?.bio;
  const areasErr = state.errors?.areas;
  const id = `edit-${providerId}`;

  return (
    <form action={action} className="auth-form edit-listing">
      <input type="hidden" name="provider_id" value={providerId} />
      <div className="field">
        <label htmlFor={`${id}-bio`}>About your business</label>
        <span id={`${id}-bio-hint`} className="hint">
          What you do and where. No phone numbers, web or email addresses: customers use the buttons on your page.
        </span>
        <textarea
          id={`${id}-bio`}
          name="bio"
          className="input textarea"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={bioErr ? true : undefined}
          aria-describedby={`${id}-bio-hint ${id}-bio-count${bioErr ? ` ${id}-bio-err` : ""}`}
        />
        <span id={`${id}-bio-count`} className="counter" data-near={length > BIO_MAX - 30 ? "" : undefined}>
          {length} / {BIO_MAX}
        </span>
        {bioErr && (
          <span id={`${id}-bio-err`} className="field-err">
            {bioErr}
          </span>
        )}
      </div>

      <fieldset className="area-picks" aria-describedby={areasErr ? `${id}-areas-err` : undefined}>
        <legend>Areas you cover</legend>
        <div className="area-grid">
          {BL_DISTRICTS.map((d) => (
            <label key={d} className="area-pick">
              <input type="checkbox" name="areas" value={d} defaultChecked={picked.has(d)} />
              <span>{d}</span>
            </label>
          ))}
        </div>
        {areasErr && (
          <span id={`${id}-areas-err`} className="field-err">
            {areasErr}
          </span>
        )}
      </fieldset>

      {state.ok && state.message && (
        <p role="status" className="form-ok">
          <TickIcon />
          {state.message}
        </p>
      )}
      {state.message && !state.ok && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
