"use client";

import { useActionState, useState } from "react";
import { newConsentLink, recordCheck, saveProvider, setStatus } from "@/app/admin/(protected)/providers/actions";
import { CHECK_KINDS, type FormState } from "@/lib/admin-shared";

const initial: FormState = {};
const input = "min-h-12 rounded border border-neutral-500 px-3 font-normal";
const button = "min-h-12 rounded bg-neutral-900 px-4 font-bold text-white disabled:opacity-60";

function FieldError({ id, state }: { id: string; state: FormState }) {
  const msg = state.errors?.[id];
  return msg ? (
    <span role="alert" className="text-sm font-semibold text-red-800">
      {msg}
    </span>
  ) : null;
}

function Status({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={state.ok ? "font-semibold text-emerald-900" : "font-semibold text-red-800"}>
      {state.message}
    </p>
  );
}

export type CategoryOption = { id: string; name: string };
export type ProviderValues = {
  id?: string;
  business_name?: string;
  contact_name?: string | null;
  phone_e164?: string;
  whatsapp_e164?: string | null;
  areas?: string[];
  bio?: string | null;
  category_ids?: string[];
};

export function ProviderForm({ categories, values = {} }: { categories: CategoryOption[]; values?: ProviderValues }) {
  const [state, action, pending] = useActionState(saveProvider, initial);
  // After a failed submit React resets the form; defaultValues from the submitted values keep it filled.
  const str = (k: string, fallback: string | null | undefined) => (state.values?.[k] as string | undefined) ?? fallback ?? "";
  const chosen = (state.values?.category_ids as string[] | undefined) ?? values.category_ids ?? [];
  return (
    <form action={action} className="flex flex-col gap-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <label className="flex flex-col gap-1 font-semibold">
        Business name
        <input name="business_name" required defaultValue={str("business_name", values.business_name)} className={input} />
        <FieldError id="business_name" state={state} />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Contact name
        <input name="contact_name" defaultValue={str("contact_name", values.contact_name)} className={input} />
        <FieldError id="contact_name" state={state} />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Phone
        <input name="phone" type="tel" required defaultValue={str("phone", values.phone_e164)} className={input} />
        <FieldError id="phone" state={state} />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        WhatsApp number (optional)
        <input name="whatsapp" type="tel" defaultValue={str("whatsapp", values.whatsapp_e164)} className={input} />
        <FieldError id="whatsapp" state={state} />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Areas covered (postcode districts, e.g. BL1, BL3)
        <input name="areas" defaultValue={str("areas", (values.areas ?? []).join(", "))} className={input} />
        <FieldError id="areas" state={state} />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Bio
        <textarea name="bio" rows={4} defaultValue={str("bio", values.bio)} className="rounded border border-neutral-500 p-3 font-normal" />
        <FieldError id="bio" state={state} />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="font-semibold">Categories (up to 3)</legend>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {categories.map((c) => (
            <label key={c.id} className="flex min-h-12 items-center gap-2">
              <input type="checkbox" name="category_ids" value={c.id} defaultChecked={chosen.includes(c.id)} className="size-5" />
              {c.name}
            </label>
          ))}
        </div>
        <FieldError id="category_ids" state={state} />
      </fieldset>
      <Status state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving…" : values.id ? "Save changes" : "Add provider"}
      </button>
    </form>
  );
}

export function CheckForm({ providerId }: { providerId: string }) {
  const [state, action, pending] = useActionState(recordCheck, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="provider_id" value={providerId} />
      <label className="flex flex-col gap-1 font-semibold">
        Kind
        <select name="kind" className={input}>
          {CHECK_KINDS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Reference
        <input name="reference" className={input} />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        Expires on (required for Gas Safe, DVSA ADI and insurance)
        <input name="expires_on" type="date" className={input} />
        <FieldError id="expires_on" state={state} />
      </label>
      <Status state={state} />
      <button type="submit" disabled={pending} className={button}>
        Record check
      </button>
    </form>
  );
}

export function StatusForm({ providerId, current }: { providerId: string; current: string }) {
  const [state, action, pending] = useActionState(setStatus, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="provider_id" value={providerId} />
      <label className="flex flex-col gap-1 font-semibold">
        Reason (required to remove)
        <input name="reason" className={input} />
        <FieldError id="reason" state={state} />
      </label>
      <FieldError id="status" state={state} />
      <Status state={state} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" name="status" value="live" disabled={pending || current !== "consented"} className={button}>
          Set live
        </button>
        <button type="submit" name="status" value="paused" disabled={pending || current === "paused" || current === "removed"} className={button}>
          Pause
        </button>
        <button type="submit" name="status" value="removed" disabled={pending || current === "removed"} className={button}>
          Remove
        </button>
      </div>
      {current === "invited" && <p>Set live becomes available once the provider has agreed through their consent link.</p>}
    </form>
  );
}

export function ConsentLinkButton({ providerId, status }: { providerId: string; status: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    setMessage(null);
    const res = await newConsentLink(providerId);
    setBusy(false);
    if (!res.url) {
      setMessage(res.error ?? "Could not create a consent link");
      return;
    }
    setLink(res.url);
    try {
      await navigator.clipboard.writeText(res.url);
      setMessage("Link copied. Any earlier link no longer works.");
    } catch {
      setMessage("Copy the link below. Any earlier link no longer works.");
    }
  }

  if (status !== "invited") {
    return <p>{status === "consented" ? "Consent given." : "Consent links are only available while a provider is invited."}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={onClick} disabled={busy} className={button}>
        New consent link
      </button>
      {message && <p role="status">{message}</p>}
      {link && <input readOnly aria-label="Consent link" value={link} onFocus={(e) => e.currentTarget.select()} className={`${input} w-full`} />}
    </div>
  );
}
