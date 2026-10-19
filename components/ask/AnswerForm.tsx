"use client";

import { useActionState, useId, useState } from "react";
import { AlertIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { answerQuestion } from "@/app/(platform)/ask/[id]/answer/actions";
import type { FormState } from "@/lib/admin-shared";
import { ANSWER_NOTE_MAX, tidyText } from "@/lib/questions";

export type PickProvider = { id: string; slug: string; businessName: string; areas: string[] };

const v = (s: FormState, k: string) => (typeof s.values?.[k] === "string" ? (s.values[k] as string) : "");

function Note({ state, label, hint }: { state: FormState; label: string; hint: string }) {
  const id = useId();
  const [note, setNote] = useState(v(state, "note"));
  const used = [...tidyText(note)].length;
  const err = state.errors?.note;
  return (
    <label className="field">
      <span>
        {label} <span className="opt">(optional)</span>
      </span>
      <span className="hint">{hint}</span>
      <textarea
        name="note"
        className="input textarea short"
        rows={2}
        maxLength={ANSWER_NOTE_MAX + 20}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-invalid={err ? true : undefined}
        aria-describedby={`${id}-count`}
      />
      <span id={`${id}-count`} className="counter" data-near={used > ANSWER_NOTE_MAX - 30 || undefined}>
        {used} / {ANSWER_NOTE_MAX}
      </span>
      {err && <span className="field-err">{err}</span>}
    </label>
  );
}

function Alert({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p role="alert" className="form-alert">
      <AlertIcon />
      {state.message}
    </p>
  );
}

const matches = (p: PickProvider, q: string) => {
  const s = q.trim().toLowerCase();
  return !s || p.businessName.toLowerCase().includes(s) || p.areas.some((a) => a.toLowerCase() === s);
};

/**
 * Recommend someone listed in the question's trade: a search box over the trade's live listings (name, or an area
 * such as BL3) and one choice. The trader's own listings aren't offered; they say "I can help" instead.
 */
export function RecommendForm({
  questionId,
  providers,
  tradeName,
}: {
  questionId: string;
  providers: PickProvider[];
  tradeName: string;
}) {
  const [state, action, pending] = useActionState(answerQuestion, {} as FormState);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(v(state, "provider_id"));
  const shown = providers.filter((p) => matches(p, query) || p.id === picked);
  const err = state.errors?.provider_id;

  return (
    <form action={action} className="auth-form" aria-label="Recommend someone">
      <input type="hidden" name="question_id" value={questionId} />
      <input type="hidden" name="kind" value="recommend" />
      <fieldset className="picker" aria-invalid={err ? true : undefined} aria-describedby={err ? "pick-err" : undefined}>
        <legend>Who do you recommend?</legend>
        <label className="picker-search">
          <span className="sr-only">Search {tradeName.toLowerCase()} listings by name or area</span>
          <input
            type="search"
            className="input"
            placeholder="Search by name or area, e.g. BL3"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </label>
        {shown.length > 0 ? (
          <ul className="picker-list" data-testid="provider-picker">
            {shown.map((p) => (
              <li key={p.id}>
                <label className="pick press">
                  <input
                    type="radio"
                    name="provider_id"
                    value={p.id}
                    checked={picked === p.id}
                    onChange={() => setPicked(p.id)}
                  />
                  <span>
                    <b>{p.businessName}</b>
                    {p.areas.length > 0 && <small>Covers {p.areas.join(", ")}</small>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="picker-empty" aria-live="polite">
            Nobody listed for {tradeName.toLowerCase()} matches &ldquo;{query.trim()}&rdquo;.
          </p>
        )}
        {err && (
          <span id="pick-err" className="field-err">
            {err}
          </span>
        )}
      </fieldset>
      <Note
        state={state}
        label="Why them?"
        hint="A line about the job they did for you. No phone numbers or web addresses."
      />
      <Alert state={state} />
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Posting…" : "Recommend them"}
      </Button>
      <p className="post-note">
        Your recommendation shows with your shown name. It isn&apos;t a review and doesn&apos;t change anyone&apos;s
        rating or place in the lists.
      </p>
    </form>
  );
}

/** "I can help": a linked trader replying about their own listing, shown as the trader speaking for themselves. */
export function CanHelpForm({ questionId, mine }: { questionId: string; mine: PickProvider[] }) {
  const [state, action, pending] = useActionState(answerQuestion, {} as FormState);
  const err = state.errors?.provider_id;
  return (
    <form action={action} className="auth-form" aria-label="I can help">
      <input type="hidden" name="question_id" value={questionId} />
      <input type="hidden" name="kind" value="can_help" />
      {mine.length === 1 ? (
        <input type="hidden" name="provider_id" value={mine[0].id} />
      ) : (
        <fieldset className="picker">
          <legend>Which of your listings?</legend>
          <ul className="picker-list">
            {mine.map((p, i) => (
              <li key={p.id}>
                <label className="pick press">
                  <input type="radio" name="provider_id" value={p.id} defaultChecked={i === 0} />
                  <span>
                    <b>{p.businessName}</b>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {err && <span className="field-err">{err}</span>}
      <Note state={state} label="A short note" hint="For example: free this week, or the work you do. No phone numbers." />
      <Alert state={state} />
      <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending}>
        {pending ? "Posting…" : mine.length === 1 ? `I can help (as ${mine[0].businessName})` : "I can help"}
      </Button>
      <p className="post-note">
        It shows as &ldquo;{mine.length === 1 ? mine[0].businessName : "Your business"} says they can help&rdquo;, apart
        from residents&apos; recommendations. Nothing else, please: no adverts or prices.
      </p>
    </form>
  );
}
