"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  newConsentLink,
  newTraderLink,
  recordCheck,
  reinviteProvider,
  saveProvider,
  setStatus,
  unlinkProviderAccount,
} from "@/app/admin/(protected)/providers/actions";
import { CHECK_KINDS, type FormState } from "@/lib/admin-shared";

const initial: FormState = {};
const input = "a-input";

function FieldError({ id, state }: { id: string; state: FormState }) {
  const msg = state.errors?.[id];
  return msg ? (
    <span role="alert" className="a-err">
      {msg}
    </span>
  ) : null;
}

function Status({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={state.ok ? "a-ok" : "a-err"}>
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
    <form action={action} className="a-form">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <label className="a-field">
        Business name
        <input name="business_name" required defaultValue={str("business_name", values.business_name)} className={input} />
        <FieldError id="business_name" state={state} />
      </label>
      <label className="a-field">
        Contact name
        <input name="contact_name" defaultValue={str("contact_name", values.contact_name)} className={input} />
        <FieldError id="contact_name" state={state} />
      </label>
      <label className="a-field">
        Phone
        <input name="phone" type="tel" required defaultValue={str("phone", values.phone_e164)} className={input} />
        <FieldError id="phone" state={state} />
      </label>
      <label className="a-field">
        WhatsApp number (optional)
        <input name="whatsapp" type="tel" defaultValue={str("whatsapp", values.whatsapp_e164)} className={input} />
        <FieldError id="whatsapp" state={state} />
      </label>
      <label className="a-field">
        Areas covered (postcode districts, e.g. BL1, BL3)
        <input name="areas" defaultValue={str("areas", (values.areas ?? []).join(", "))} className={input} />
        <FieldError id="areas" state={state} />
      </label>
      <label className="a-field">
        Bio
        <textarea name="bio" rows={4} defaultValue={str("bio", values.bio)} className="a-input" />
        <FieldError id="bio" state={state} />
      </label>
      <fieldset className="a-field">
        <legend className="mb-1 font-bold">Categories (up to 3)</legend>
        <div className="a-checks">
          {categories.map((c) => (
            <label key={c.id} className="a-check">
              <input type="checkbox" name="category_ids" value={c.id} defaultChecked={chosen.includes(c.id)} />
              {c.name}
            </label>
          ))}
        </div>
        <FieldError id="category_ids" state={state} />
      </fieldset>
      <Status state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : values.id ? "Save changes" : "Add provider"}
      </Button>
    </form>
  );
}

export function CheckForm({ providerId }: { providerId: string }) {
  const [state, action, pending] = useActionState(recordCheck, initial);
  return (
    <form action={action} className="a-form">
      <input type="hidden" name="provider_id" value={providerId} />
      <label className="a-field">
        Kind
        <select name="kind" className={input}>
          {CHECK_KINDS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="a-field">
        Reference
        <input name="reference" className={input} />
      </label>
      <label className="a-field">
        Expires on (required for Gas Safe, DVSA ADI and insurance)
        <input name="expires_on" type="date" className={input} />
        <FieldError id="expires_on" state={state} />
      </label>
      <Status state={state} />
      <Button type="submit" disabled={pending}>
        Record check
      </Button>
    </form>
  );
}

export function StatusForm({ providerId, current, hasConsent }: { providerId: string; current: string; hasConsent: boolean }) {
  const [state, action, pending] = useActionState(setStatus, initial);
  return (
    <form action={action} className="a-form">
      <input type="hidden" name="provider_id" value={providerId} />
      <label className="a-field">
        Reason (required to remove)
        <input name="reason" className={input} />
        <FieldError id="reason" state={state} />
      </label>
      <FieldError id="status" state={state} />
      <Status state={state} />
      <div className="a-actions">
        <Button type="submit" name="status" value="live" variant="primary" disabled={pending || !(current === "consented" || (current === "paused" && hasConsent))}>
          Set live
        </Button>
        <Button type="submit" name="status" value="paused" variant="secondary" disabled={pending || current === "paused" || current === "removed"}>
          Pause
        </Button>
        <Button type="submit" name="status" value="removed" variant="secondary" disabled={pending || current === "removed"}>
          Remove
        </Button>
      </div>
      {current === "invited" && <p className="a-hint">Set live becomes available once the provider has agreed through their consent link.</p>}
    </form>
  );
}

export function ConsentLinkButton({ providerId, status, expires }: { providerId: string; status: string; expires?: string | null }) {
  const [link, setLink] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState<string | null>(expires ?? null);
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
    if (res.expires) setExpiresOn(res.expires);
    try {
      await navigator.clipboard.writeText(res.url);
      setMessage("Link copied. Any earlier link no longer works.");
    } catch {
      setMessage("Copy the link below. Any earlier link no longer works.");
    }
  }

  if (status !== "invited") {
    return <p className="text-ink-2">{status === "consented" ? "Consent given." : "Consent links are only available while a provider is invited."}</p>;
  }
  return (
    <div className="grid gap-3">
      <Button type="button" onClick={onClick} disabled={busy}>
        New consent link
      </Button>
      <p className="a-hint">Creates a fresh link and copies it, ready to paste into WhatsApp.</p>
      {expiresOn && <p className="a-hint">Link expires on {expiresOn}</p>}
      {message && <p role="status" className="a-ok">{message}</p>}
      {link && <input readOnly aria-label="Consent link" value={link} onFocus={(e) => e.currentTarget.select()} className={`${input} w-full`} />}
    </div>
  );
}

// Only for removed providers: back to invited with a fresh consent link (they must agree again).
export function ReinviteForm({ providerId, removed }: { providerId: string; removed: boolean }) {
  const [state, action, pending] = useActionState(reinviteProvider, initial);
  const [copied, setCopied] = useState<string | null>(null);
  const url = typeof state.values?.consent_url === "string" ? state.values.consent_url : null;
  const expires = typeof state.values?.consent_expires === "string" ? state.values.consent_expires : null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Link copied.");
    } catch {
      setCopied("Copy the link below.");
    }
  }

  if (state.ok && url) {
    return (
      <div className="grid gap-3">
        <Status state={state} />
        <Button type="button" onClick={copy}>
          Copy consent link
        </Button>
        {expires && <p className="a-hint">Link expires on {expires}</p>}
        {copied && <p role="status" className="a-ok">{copied}</p>}
        <input readOnly aria-label="Consent link" value={url} onFocus={(e) => e.currentTarget.select()} className={`${input} w-full`} />
      </div>
    );
  }
  if (!removed) return null;
  return (
    <form action={action} className="a-form">
      <h3>Re-invite</h3>
      <input type="hidden" name="provider_id" value={providerId} />
      <label className="a-field">
        Reason for re-inviting (kept in the audit log)
        <textarea name="reason" rows={2} className={input} defaultValue={typeof state.values?.reason === "string" ? state.values.reason : ""} />
        <FieldError id="reason" state={state} />
      </label>
      <Status state={state} />
      <div className="a-actions">
        <Button type="submit" variant="primary" disabled={pending}>
          Re-invite
        </Button>
      </div>
      <p className="a-hint">They go back to invited with a new consent link, and must agree again before going live.</p>
    </form>
  );
}

// Trader sign-in link: a single-use link the trader opens while signed in to link their account to the listing.
export function TraderLinkButton({ providerId, expires }: { providerId: string; expires?: string | null }) {
  const [link, setLink] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState<string | null>(expires ?? null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function copy(url: string, fresh: boolean) {
    const after = fresh ? " Any earlier link no longer works." : "";
    try {
      await navigator.clipboard.writeText(url);
      setMessage({ ok: true, text: `Link copied.${after}` });
    } catch {
      setMessage({ ok: true, text: `Copy the link below.${after}` });
    }
  }

  async function onClick() {
    setBusy(true);
    setMessage(null);
    const res = await newTraderLink(providerId);
    setBusy(false);
    if (!res.url) {
      setMessage({ ok: false, text: res.error ?? "Could not create a trader link. Try again." });
      return;
    }
    setLink(res.url);
    if (res.expires) setExpiresOn(res.expires);
    await copy(res.url, true);
  }

  return (
    <div className="grid gap-3">
      {link ? (
        <Button type="button" onClick={() => copy(link, false)}>
          Copy link
        </Button>
      ) : (
        <Button type="button" onClick={onClick} disabled={busy}>
          Trader sign-in link
        </Button>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "a-ok" : "a-err"}>
          {message.text}
        </p>
      )}
      {link && (
        <input
          readOnly
          aria-label="Trader sign-in link"
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className={`${input} w-full`}
        />
      )}
      {link && expiresOn ? (
        <p className="a-hint">Expires on {expiresOn}. Works once.</p>
      ) : expiresOn ? (
        <p className="a-hint">A link sent earlier works until {expiresOn}. Making a new one stops it working.</p>
      ) : (
        <p className="a-hint">
          Makes a link and copies it, ready to paste into WhatsApp. The trader opens it, signs in with Google or their
          email, and their account is linked to this listing.
        </p>
      )}
    </div>
  );
}

// Unlinks the account from the listing, with a reason kept in the audit log.
export function UnlinkForm({ providerId }: { providerId: string }) {
  const [state, action, pending] = useActionState(unlinkProviderAccount, initial);
  if (state.ok) return <Status state={state} />;
  return (
    <form action={action} className="a-form">
      <input type="hidden" name="provider_id" value={providerId} />
      <label className="a-field">
        Reason for unlinking (kept in the audit log)
        <textarea
          name="reason"
          rows={2}
          className={input}
          defaultValue={typeof state.values?.reason === "string" ? state.values.reason : ""}
        />
        <FieldError id="reason" state={state} />
      </label>
      <Status state={state} />
      <div className="a-actions">
        <Button type="submit" variant="secondary" disabled={pending}>
          Unlink
        </Button>
      </div>
      <p className="a-hint">Use this if the wrong person opened the link. You can then make a new one.</p>
    </form>
  );
}
