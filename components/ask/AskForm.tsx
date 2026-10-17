"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertIcon, ChevronDown, ClockIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { AskMatches } from "@/components/ask/AskMatches";
import { askQuestion, type AskState } from "@/app/platform/ask/new/actions";
import { BL_DISTRICTS } from "@/lib/districts";
import { platformPath } from "@/lib/paths";
import { QUESTION_MAX, tidyText } from "@/lib/questions";
import { guessTrade } from "@/lib/trade-words";

type TradeGroup = { name: string; categories: { id: string; slug: string; name: string }[] };

/**
 * The question (10 to 280 characters, no phone numbers or web addresses), its trade and area. The trade is picked
 * from the question's words until the person chooses one themselves, and traders already listed for that trade
 * and area show straight away.
 */
export function AskForm({
  groups,
  defaultCategory,
  defaultDistrict,
  held,
}: {
  groups: TradeGroup[];
  defaultCategory: string;
  defaultDistrict: string;
  /** An email-only account: the question waits for a quick check before it goes up. */
  held: boolean;
}) {
  const [state, action, pending] = useActionState(askQuestion, {} as AskState);
  const v = (k: string) => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : "");
  const [body, setBody] = useState(v("body"));
  const err = state.errors ?? {};
  const used = [...tidyText(body)].length;
  const categories = useMemo(() => groups.flatMap((g) => g.categories), [groups]);
  // Chosen by the person (or carried in from a category page or a failed post): the words no longer override it.
  const [chosen, setChosen] = useState(v("category_id") || defaultCategory);
  const [district, setDistrict] = useState(v("district") || defaultDistrict);
  const guessed = chosen ? null : guessTrade(body, categories);
  const categoryId = chosen || guessed?.id || "";
  const trade = categories.find((c) => c.id === categoryId);

  if (state.held) {
    return (
      <div className="done" aria-live="polite">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="46" />
          <path d="M30 52 44 65 71 37" />
        </svg>
        <h2 className="display">Question sent</h2>
        <p>We&apos;ll give it a quick check, then it goes up for the neighbours to answer.</p>
        <Button href={platformPath("ask")} variant="secondary">
          See other questions
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="auth-form" aria-label="Your question">
      <label className="field">
        Your question
        <span className="hint">For example: &ldquo;Anyone know a good electrician in BL3? Need two sockets moving.&rdquo;</span>
        <textarea
          name="body"
          className="input textarea"
          rows={4}
          required
          minLength={10}
          maxLength={QUESTION_MAX + 20}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={err.body ? true : undefined}
          aria-describedby="ask-count"
        />
        <span id="ask-count" className="counter" data-near={used > QUESTION_MAX - 30 || undefined}>
          {used} / {QUESTION_MAX}
        </span>
        {err.body && <span className="field-err">{err.body}</span>}
      </label>
      <label className="field">
        Which trade?
        {guessed && (
          <span className="hint" data-testid="trade-guessed">
            Picked from your question. Change it if it&apos;s not right.
          </span>
        )}
        <span className="select">
          <select
            name="category_id"
            className="input"
            required
            value={categoryId}
            onChange={(e) => setChosen(e.target.value)}
            aria-invalid={err.category_id ? true : undefined}
          >
            <option value="" disabled>
              Choose a trade
            </option>
            {groups.map((g) => (
              <optgroup key={g.name} label={g.name}>
                {g.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown />
        </span>
        {err.category_id && <span className="field-err">{err.category_id}</span>}
      </label>
      <label className="field">
        Where?
        <span className="hint">Shown with your question, so people suggest someone who covers it.</span>
        <span className="select">
          <select
            name="district"
            className="input"
            required
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
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
          </select>
          <ChevronDown />
        </span>
        {err.district && <span className="field-err">{err.district}</span>}
      </label>
      {trade && district && <AskMatches slug={trade.slug} tradeName={trade.name} district={district} />}
      {held && (
        <p className="form-note">
          <ClockIcon />
          You signed in with an email code, so we&apos;ll give your question a quick check before it goes up.
        </p>
      )}
      {state.message && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Posting…" : "Post question"}
      </Button>
      <p className="post-note">
        Your question shows with your shown name and area, and takes answers for 14 days. No phone numbers or web
        addresses, please: people answer by naming someone listed here.
      </p>
    </form>
  );
}
