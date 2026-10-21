"use client";

import { startTransition, useActionState, useState } from "react";
import { AlertIcon, TickIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import {
  addWorkPhoto,
  moveWorkPhoto,
  openBillingPortal,
  removeWorkPhoto,
  sendProDocument,
  startProCheckout,
} from "@/app/(platform)/provider/pro-actions";
import type { FormState } from "@/lib/admin-shared";
import {
  DOCUMENT_KINDS,
  MAX_PHOTO_BYTES,
  PHOTO_ACCEPT,
  PHOTO_TOO_BIG,
  PHOTO_WRONG_TYPE,
  PLANS,
  type DocumentKind,
} from "@/lib/pro";
import { MAX_PROOF_BYTES, PROOF_ACCEPT, PROOF_TOO_BIG, PROOF_WRONG_TYPE } from "@/lib/review-form";

// The trader's Pro forms: choosing a plan (to Stripe Checkout), Manage billing (Stripe's portal), sending ID documents
// and the work photos. Each runs a server action in pro-actions.ts and shows its answer in place.

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

const ChevronDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </svg>
);

/** Monthly or yearly, then Continue to payment (Stripe's page). */
export function ProUpgradeForm({ providerId }: { providerId: string }) {
  const [state, action, pending] = useActionState(startProCheckout, {} as FormState);
  const planErr = state.errors?.plan;
  return (
    <form action={action} className="auth-form pro-upgrade-form">
      <input type="hidden" name="provider_id" value={providerId} />
      <fieldset className="plan-picks" aria-describedby={planErr ? `plan-err-${providerId}` : undefined}>
        <legend>Choose how to pay</legend>
        {PLANS.map((p, i) => (
          <label key={p.plan} className="plan-pick">
            <input type="radio" name="plan" value={p.plan} defaultChecked={i === 0} />
            <span>
              <b>{p.price}</b>
              <small>{p.note}</small>
            </span>
          </label>
        ))}
        {planErr && (
          <span id={`plan-err-${providerId}`} className="field-err">
            {planErr}
          </span>
        )}
      </fieldset>
      <Result state={state} />
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Opening payment…" : "Continue to payment"}
      </Button>
      <p className="pro-small">
        You pay on Stripe&apos;s secure page; we never see your card. No VAT. Cancel any time from Manage billing.
      </p>
    </form>
  );
}

/** Opens Stripe's billing portal. */
export function ManageBillingForm({ providerId }: { providerId: string }) {
  const [state, action, pending] = useActionState(openBillingPortal, {} as FormState);
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="provider_id" value={providerId} />
      <Result state={state} />
      <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending}>
        {pending ? "Opening…" : "Manage billing"}
      </Button>
    </form>
  );
}

const PaperIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);

/** A file box: the native input over a friendly face, with the chosen file's name. */
function FilePick({
  id,
  name,
  accept,
  label,
  error,
  onPick,
  picked,
  describedBy,
  icon,
}: {
  id: string;
  name: string;
  accept: string;
  label: string;
  error?: string;
  onPick: (file: File | null) => void;
  picked: string;
  describedBy?: string;
  icon: React.ReactNode;
}) {
  return (
    <span className={picked ? "file-pick has-file" : "file-pick"}>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <span className="file-face" aria-hidden="true">
        {icon}
        <span>{picked || label}</span>
      </span>
    </span>
  );
}

/** Photo ID (required for the ID check), or an optional insurance certificate or accreditation. */
export function DocumentForm({ providerId, idNeeded }: { providerId: string; idNeeded: boolean }) {
  const [state, action, pending] = useActionState(sendProDocument, {} as FormState);
  const [picked, setPicked] = useState("");
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<DocumentKind>(idNeeded ? "photo_id" : "insurance");
  const id = `doc-${providerId}`;
  const fileErr = err || state.errors?.file;

  function onPick(file: File | null) {
    setErr("");
    if (!file) return setPicked("");
    const problem = file.size > MAX_PROOF_BYTES ? PROOF_TOO_BIG : !PROOF_ACCEPT.split(",").includes(file.type) ? PROOF_WRONG_TYPE : "";
    if (problem) {
      setErr(problem);
      setPicked("");
      return;
    }
    setPicked(file.name);
  }

  return (
    <form
      action={(fd) => {
        action(fd);
        setPicked("");
      }}
      className="auth-form"
    >
      <input type="hidden" name="provider_id" value={providerId} />
      <div className="field">
        <label htmlFor={`${id}-kind`}>What are you sending?</label>
        <span className="select">
          <select
            id={`${id}-kind`}
            name="kind"
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as DocumentKind)}
          >
            {DOCUMENT_KINDS.filter(([k]) => idNeeded || k !== "photo_id").map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown />
        </span>
      </div>
      <div className="field">
        <label htmlFor={`${id}-file`}>Photo or PDF</label>
        <span className="hint" id={`${id}-hint`}>
          {kind === "photo_id"
            ? "A clear photo of your passport or driving licence, all four corners in view. Only we see it, and we delete it 30 days after we've checked it."
            : "Only we see it. We record what it shows (and when it runs out) on your page, then delete the file 30 days later."}
        </span>
        <FilePick
          id={`${id}-file`}
          name="file"
          accept={PROOF_ACCEPT}
          label="Choose a photo or PDF"
          error={fileErr}
          onPick={onPick}
          picked={picked}
          describedBy={`${id}-hint${fileErr ? ` ${id}-err` : ""}`}
          icon={<PaperIcon />}
        />
        {fileErr && (
          <span id={`${id}-err`} className="field-err">
            {fileErr}
          </span>
        )}
      </div>
      <Result state={state} />
      <Button type="submit" disabled={pending || !!err} aria-busy={pending}>
        {pending ? "Sending…" : "Send for checking"}
      </Button>
    </form>
  );
}

/**
 * Big phone photos are scaled down in the browser first (to 2400 pixels, as a JPEG), so they upload quickly and fit
 * the 5 MB limit. The server re-encodes every photo anyway. Anything that can't be read here is sent as it is.
 */
async function shrink(file: File): Promise<File> {
  if (file.size <= 2_500_000 || typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Adds one work photo. */
export function PhotoUploadForm({ providerId, left }: { providerId: string; left: number }) {
  const [state, action, pending] = useActionState(addWorkPhoto, {} as FormState);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // A new key empties the file box after each upload.
  const [pick, setPick] = useState(0);
  const id = `photo-${providerId}`;
  const photoErr = err || state.errors?.photo;

  function onPick(f: File | null) {
    setErr("");
    if (f && !PHOTO_ACCEPT.split(",").includes(f.type)) {
      setErr(PHOTO_WRONG_TYPE);
      return setFile(null);
    }
    setFile(f);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return setErr("Choose a photo first.");
    setBusy(true);
    const small = await shrink(file);
    setBusy(false);
    if (small.size > MAX_PHOTO_BYTES) return setErr(PHOTO_TOO_BIG);
    const fd = new FormData();
    fd.set("provider_id", providerId);
    fd.set("photo", small);
    startTransition(() => action(fd));
    setFile(null);
    setPick((n) => n + 1);
  }

  const working = pending || busy;
  return (
    <form onSubmit={submit} className="auth-form">
      <div className="field">
        <label htmlFor={`${id}-file`}>Add a photo</label>
        <span className="hint" id={`${id}-hint`}>
          Your own work: before and after, finished jobs. JPEG, PNG or WebP. {left} more to go.
        </span>
        <FilePick
          key={pick}
          id={`${id}-file`}
          name="photo"
          accept={PHOTO_ACCEPT}
          label="Choose a photo"
          error={photoErr}
          onPick={onPick}
          picked={file?.name ?? ""}
          describedBy={`${id}-hint${photoErr ? ` ${id}-err` : ""}`}
          icon={<UploadIcon />}
        />
        {photoErr && (
          <span id={`${id}-err`} className="field-err">
            {photoErr}
          </span>
        )}
      </div>
      <Result state={state} />
      <Button type="submit" disabled={working} aria-busy={working}>
        {working ? "Adding…" : "Add to my page"}
      </Button>
    </form>
  );
}

/** Move earlier, Move later and Remove for one photo. */
export function PhotoActions({
  providerId,
  photoId,
  n,
  of,
  canMove,
}: {
  providerId: string;
  photoId: string;
  n: number;
  of: number;
  canMove: boolean;
}) {
  const [moveState, move, moving] = useActionState(moveWorkPhoto, {} as FormState);
  const [removeState, remove, removing] = useActionState(removeWorkPhoto, {} as FormState);
  const failed = [moveState, removeState].find((s) => s.message && !s.ok);
  return (
    <div className="photo-actions">
      {canMove && (
        <form action={move} className="photo-move">
          <input type="hidden" name="provider_id" value={providerId} />
          <input type="hidden" name="photo_id" value={photoId} />
          <button type="submit" name="direction" value="earlier" className="chip press" disabled={moving || n === 1} aria-label={`Move photo ${n} earlier`}>
            ←
          </button>
          <button type="submit" name="direction" value="later" className="chip press" disabled={moving || n === of} aria-label={`Move photo ${n} later`}>
            →
          </button>
        </form>
      )}
      <form action={remove}>
        <input type="hidden" name="provider_id" value={providerId} />
        <input type="hidden" name="photo_id" value={photoId} />
        <button type="submit" className="chip press photo-remove" disabled={removing} aria-label={`Remove photo ${n}`}>
          Remove
        </button>
      </form>
      {failed && (
        <p role="alert" className="field-err">
          {failed.message}
        </p>
      )}
    </div>
  );
}
