"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertIcon, ChevronDown } from "@/components/auth/icons";
import { TapChoice } from "@/components/review/TapChoice";
import { Button } from "@/components/ui/Button";
import { editReview, submitReview, type ReviewFormState } from "@/app/platform/p/[slug]/review/actions";
import { clearDraft, loadDraft, saveDraft } from "@/lib/review-draft";
import {
  COMMENT_MAX,
  MAX_PROOF_BYTES,
  PROOF_ACCEPT,
  PROOF_TOO_BIG,
  PROOF_WRONG_TYPE,
  ON_PRICE_OPTIONS,
  ON_TIME_OPTIONS,
  QUALITY_OPTIONS,
  REVIEW_FIELDS,
  statusLabel,
  TIDY_OPTIONS,
  USE_AGAIN_OPTIONS,
  VALUE_BAND_OPTIONS,
} from "@/lib/review-form";
import { platformPath } from "@/lib/paths";
import type { ReviewSource } from "@/lib/review-link";

export type ReviewValues = Record<(typeof REVIEW_FIELDS)[number], string>;
export type ReviewCategory = { id: string; name: string; asksTidy: boolean };

type Props = {
  slug: string;
  providerId: string;
  businessName: string;
  displayName: string;
  categories: ReviewCategory[];
  months: { value: string; label: string }[];
  /** Editing the person's own review (within 14 days): its id, answers and the last day it can change. */
  existing?: { id: string; values: ReviewValues; editableUntil: string; hasProof: boolean };
  /** The page's title card, shown above the questions and replaced by the result once posted. */
  header?: React.ReactNode;
  /** Where a new review started ("card": the trader's review link), recorded for the admin only. */
  source?: ReviewSource | null;
};

const EMPTY: ReviewValues = {
  category_id: "",
  job_month: "",
  value_band: "",
  on_time: "",
  on_price: "",
  quality: "",
  tidy: "",
  use_again: "",
  comment: "",
};

const noop = () => () => {};
const storage = () => (typeof window === "undefined" ? undefined : window.localStorage);

/**
 * The review form. A new review keeps a draft on the device as the person taps, so it survives a reload or
 * signing in. The draft is read after hydration (the server can't see it), which remounts the form with it.
 */
export function ReviewForm(props: Props) {
  const { slug, existing } = props;
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const initial = useMemo<ReviewValues>(() => {
    if (existing) return existing.values;
    const only = props.categories.length === 1 ? props.categories[0].id : "";
    const base = { ...EMPTY, category_id: only };
    const draft = hydrated ? loadDraft(storage(), slug) : null;
    if (!draft) return base;
    for (const k of REVIEW_FIELDS) if (typeof draft[k] === "string") base[k] = draft[k];
    if (only) base.category_id = only;
    return base;
  }, [hydrated, existing, slug, props.categories]);
  return <Form key={hydrated ? "client" : "server"} {...props} initial={initial} />;
}

function Form({
  slug,
  providerId,
  businessName,
  displayName,
  categories,
  months,
  existing,
  header,
  source,
  initial,
}: Props & { initial: ReviewValues }) {
  const [state, action, pending] = useActionState(existing ? editReview : submitReview, {} as ReviewFormState);
  const [v, setV] = useState<ReviewValues>(initial);
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  // A field's error goes as soon as the person changes that answer; a new result brings fresh errors.
  const [fixed, setFixed] = useState<{ for: ReviewFormState; keys: string[] }>({ for: state, keys: [] });
  if (fixed.for !== state) setFixed({ for: state, keys: [] });
  const errors = Object.fromEntries(
    Object.entries(state.errors ?? {}).filter(([k]) => fixed.for !== state || !fixed.keys.includes(k)),
  );

  const category = categories.find((c) => c.id === v.category_id);
  const asksTidy = category?.asksTidy ?? false;

  function set(name: keyof ReviewValues, value: string) {
    if (state.errors?.[name]) setFixed((f) => ({ ...f, keys: [...f.keys, name] }));
    setV((prev) => {
      const next = { ...prev, [name]: value };
      if (!existing) saveDraft(storage(), slug, next);
      return next;
    });
  }

  // After a failed post, bring the first problem into view; after a good one, clear the draft and announce it.
  useEffect(() => {
    if (state.ok) {
      // Always: posting refreshes the page, which then passes the new review in as `existing`.
      clearDraft(storage(), slug);
      resultRef.current?.focus();
      window.scrollTo({ top: 0 });
      return;
    }
    const first = REVIEW_FIELDS.find((f) => state.errors?.[f]);
    const el = first
      ? formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)
      : state.error
        ? formRef.current?.querySelector<HTMLElement>(".form-alert")
        : null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state, slug]);

  if (state.ok && state.status) {
    const checking = state.status === "under_check";
    const held = state.status === "pending";
    return (
      <section className="auth-card" aria-live="polite">
        <div className={checking || held ? "done done-check" : "done"}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" />
            {checking || held ? <path d="M50 28v24l14 9" /> : <path d="M30 52 44 65 71 37" />}
          </svg>
          <h1 className="display" ref={resultRef} tabIndex={-1}>
            {statusLabel(state.status)}
          </h1>
          {held ? (
            <p>
              Thank you. Because you signed in with an email code, we read your review before it goes on the{" "}
              {businessName} page. You can see it in your account in the meantime.
            </p>
          ) : checking ? (
            <p>
              Your review is live now, with an &ldquo;Under check&rdquo; label while we take a quick look. It still
              counts. Our automatic checks pick out lots of reviews, good and bad, so it isn&apos;t a judgement on you.
            </p>
          ) : (
            <p>Thank you. Your review is live on the {businessName} page now, helping the next person in Bolton.</p>
          )}
          {state.proofError && (
            <p role="alert" className="form-alert">
              <AlertIcon />
              {state.proofError}
            </p>
          )}
        </div>
        <Button href={platformPath("p", slug)}>Back to {businessName}</Button>
        <a className="text-btn" href={platformPath("account")}>
          Your account
        </a>
      </section>
    );
  }

  const missing = REVIEW_FIELDS.some((f) => f !== "comment" && errors[f]);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };

  return (
    <>
      {header}
      <form ref={formRef} onSubmit={onSubmit} className="review-form" aria-label="Your review" noValidate>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="provider_id" value={providerId} />
        <input type="hidden" name="asks_tidy" value={asksTidy ? "1" : ""} />
        {existing && <input type="hidden" name="review_id" value={existing.id} />}
        {!existing && source && <input type="hidden" name="source" value={source} />}

        {missing && (
          <p role="alert" className="form-alert">
            <AlertIcon />A few answers are missing. They&apos;re marked below.
          </p>
        )}

        <section className="auth-card q-card">
          {categories.length > 1 ? (
            <TapChoice
              name="category_id"
              legend="What did they do for you?"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              value={v.category_id}
              onChange={(x) => set("category_id", x)}
              error={errors.category_id}
              layout="two"
            />
          ) : (
            <input type="hidden" name="category_id" value={v.category_id} />
          )}

          <label className="field q" data-field="job_month">
            When was the job?
            <span className="select">
              <select
                name="job_month"
                className="input"
                value={v.job_month}
                onChange={(e) => set("job_month", e.target.value)}
                aria-invalid={errors.job_month ? true : undefined}
              >
                <option value="" disabled>
                  Choose the month
                </option>
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <ChevronDown />
            </span>
            {errors.job_month && <span className="field-err">{errors.job_month}</span>}
          </label>

          <TapChoice
            name="value_band"
            legend="Roughly how much was it?"
            options={VALUE_BAND_OPTIONS}
            value={v.value_band}
            onChange={(x) => set("value_band", x)}
            error={errors.value_band}
            layout="two"
          />
        </section>

        <section className="auth-card q-card">
          <TapChoice
            name="on_time"
            legend="Did they turn up when they said?"
            options={ON_TIME_OPTIONS}
            value={v.on_time}
            onChange={(x) => set("on_time", x)}
            error={errors.on_time}
          />
          <TapChoice
            name="on_price"
            legend="Did they stick to the price?"
            options={ON_PRICE_OPTIONS}
            value={v.on_price}
            onChange={(x) => set("on_price", x)}
            error={errors.on_price}
          />
          <TapChoice
            name="quality"
            legend="Quality of work"
            hint="1 is poor, 5 is excellent"
            options={QUALITY_OPTIONS.map((o) => ({ value: o.value, label: o.value, sub: o.label }))}
            value={v.quality}
            onChange={(x) => set("quality", x)}
            error={errors.quality}
            layout="five"
          />
          {asksTidy ? (
            <TapChoice
              name="tidy"
              legend="Did they leave the place tidy?"
              options={TIDY_OPTIONS}
              value={v.tidy}
              onChange={(x) => set("tidy", x)}
              error={errors.tidy}
              layout="two"
            />
          ) : (
            <input type="hidden" name="tidy" value="" />
          )}
          <TapChoice
            name="use_again"
            legend="Would you use them again?"
            options={USE_AGAIN_OPTIONS}
            value={v.use_again}
            onChange={(x) => set("use_again", x)}
            error={errors.use_again}
            layout="three"
          />
        </section>

        <section className="auth-card q-card">
          <label className="field q" data-field="comment">
            <span>
              Anything to add? <span className="opt">(optional)</span>
            </span>
            <span className="hint">What went well, or what didn&apos;t. Please leave out phone numbers.</span>
            <textarea
              name="comment"
              className="input textarea"
              rows={4}
              maxLength={COMMENT_MAX}
              value={v.comment}
              onChange={(e) => set("comment", e.target.value)}
              aria-invalid={errors.comment ? true : undefined}
              aria-describedby="comment-count"
            />
            <span className="counter" id="comment-count" data-near={v.comment.length > COMMENT_MAX - 40 || undefined}>
              {v.comment.length}/{COMMENT_MAX}
            </span>
            {errors.comment && <span className="field-err">{errors.comment}</span>}
          </label>
          {existing?.hasProof ? (
            <p className="proof-sent">
              <span className="ri" aria-hidden="true">
                <PaperIcon />
              </span>
              <span>
                <b>Proof sent</b> Only the admin sees it.
              </span>
            </p>
          ) : (
            <ProofField />
          )}
        </section>

        <div className="post">
          <p className="honest">Be honest — mixed jobs are useful too.</p>
          {state.error && (
            <p role="alert" className="form-alert">
              <AlertIcon />
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? (existing ? "Saving…" : "Posting…") : existing ? "Save changes" : "Post review"}
          </Button>
          <p className="post-note">
            {existing
              ? `You can change your review until ${existing.editableUntil}.`
              : `Shows as ${displayName} — you can change it for 14 days.`}
          </p>
        </div>
      </form>
    </>
  );
}

const PaperIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);

/**
 * Optional proof of the job. The accept list makes iPhones convert HEIC photos to JPEG when one is picked.
 * Size and type are checked here for a quick answer, and again on the server from the file itself.
 */
function ProofField() {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError("");
    setName("");
    if (!file) return;
    const problem =
      file.size > MAX_PROOF_BYTES
        ? PROOF_TOO_BIG
        : !PROOF_ACCEPT.split(",").includes(file.type)
          ? PROOF_WRONG_TYPE
          : "";
    if (problem) {
      setError(problem);
      e.target.value = "";
      return;
    }
    setName(file.name);
  }

  function clear() {
    if (input.current) input.current.value = "";
    setName("");
    setError("");
  }

  return (
    <div className="field q" data-field="proof">
      <label htmlFor="proof">
        Proof of the job <span className="opt">(optional)</span>
      </label>
      <span className="hint" id="proof-hint">
        A photo of the invoice or the finished work. Optional — only the admin sees this.
      </span>
      <span className={name ? "file-pick has-file" : "file-pick"}>
        <input
          ref={input}
          id="proof"
          name="proof"
          type="file"
          accept={PROOF_ACCEPT}
          onChange={onPick}
          aria-describedby="proof-hint"
          aria-invalid={error ? true : undefined}
        />
        <span className="file-face" aria-hidden="true">
          <PaperIcon />
          <span>{name || "Add a photo or PDF"}</span>
        </span>
      </span>
      {name && (
        <button type="button" className="text-btn file-clear" onClick={clear}>
          Remove this file
        </button>
      )}
      {error && (
        <span className="field-err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
