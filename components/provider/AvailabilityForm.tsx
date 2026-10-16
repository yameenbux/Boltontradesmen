"use client";

import { useActionState, useState } from "react";
import { AlertIcon, TickIcon } from "@/components/auth/icons";
import { AvailabilityChip } from "@/components/AvailabilityChip";
import { Button } from "@/components/ui/Button";
import type { FormState } from "@/lib/admin-shared";
import type { Availability } from "@/lib/availability";

/** What the page worked out (on the server, so the words match its clock): what shows now, and how fresh it is. */
export type AvailabilityNow = {
  showing: Availability | null;
  /** "updated today" */
  updated: string | null;
  /** "It stops showing on 30 Oct unless you set it again." */
  ends: string | null;
  /** Something was set, but it has run out. */
  expired: boolean;
};

type Choice = "taking" | "booked" | "none";

/**
 * Taking on work (optionally "this week"), Booked up until a date (tomorrow to 6 months ahead), or nothing. The
 * trader's page and the admin's provider page share it; `admin` switches to the admin's field styles and wording.
 */
export function AvailabilityForm({
  action,
  now,
  range,
  providerId,
  admin = false,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  now: AvailabilityNow;
  range: { min: string; max: string };
  providerId?: string;
  admin?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const [choice, setChoice] = useState<Choice>(now.showing?.status ?? "none");
  const [thisWeek, setThisWeek] = useState(now.showing?.status === "taking" && now.showing.until !== null);
  const [until, setUntil] = useState(now.showing?.status === "booked" ? (now.showing.until ?? "") : "");
  const untilErr = state.errors?.until;
  const choiceErr = state.errors?.choice;
  const id = providerId ? `avail-${providerId}` : "avail";
  const input = admin ? "a-input" : "input";

  return (
    <form action={formAction} className="avail-form">
      {providerId && <input type="hidden" name="provider_id" value={providerId} />}
      <p className="avail-now" data-testid="availability-now">
        {now.showing ? (
          <>
            <span className="avail-now-row">
              <span>{admin ? "Showing now:" : "Your page shows:"}</span>
              <AvailabilityChip availability={now.showing} />
              <span>· {now.updated}</span>
            </span>
            <span className="avail-ends">{now.ends}</span>
          </>
        ) : now.expired ? (
          "The last update has run out, so nothing shows now."
        ) : (
          "Nothing shows now."
        )}
      </p>

      <fieldset className="avail-opts" aria-describedby={choiceErr ? `${id}-choice-err` : undefined}>
        <legend className={admin ? "a-field" : "avail-legend"}>{admin ? "Availability" : "Are you taking on work?"}</legend>
        <label className="avail-opt">
          <input type="radio" name="choice" value="taking" checked={choice === "taking"} onChange={() => setChoice("taking")} />
          <span>Taking on work</span>
        </label>
        {choice === "taking" && (
          <label className="avail-sub avail-check">
            <input type="checkbox" name="this_week" value="on" checked={thisWeek} onChange={(e) => setThisWeek(e.target.checked)} />
            <span>Can start this week</span>
          </label>
        )}
        <label className="avail-opt">
          <input type="radio" name="choice" value="booked" checked={choice === "booked"} onChange={() => setChoice("booked")} />
          <span>Booked up</span>
        </label>
        {choice === "booked" && (
          <div className="avail-sub">
            <label className={admin ? "a-field" : "field"} htmlFor={`${id}-until`}>
              Booked up until
            </label>
            <input
              id={`${id}-until`}
              name="until"
              type="date"
              className={input}
              min={range.min}
              max={range.max}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              required
              aria-invalid={untilErr ? true : undefined}
              aria-describedby={`${id}-until-hint${untilErr ? ` ${id}-until-err` : ""}`}
            />
            <span id={`${id}-until-hint`} className={admin ? "a-hint" : "avail-hint"}>
              Any day from tomorrow to 6 months ahead.
            </span>
            {untilErr && (
              <span id={`${id}-until-err`} className={admin ? "a-err" : "field-err"}>
                {untilErr}
              </span>
            )}
          </div>
        )}
        <label className="avail-opt">
          <input type="radio" name="choice" value="none" checked={choice === "none"} onChange={() => setChoice("none")} />
          <span>Don&apos;t show anything</span>
        </label>
        {choiceErr && (
          <span id={`${id}-choice-err`} className={admin ? "a-err" : "field-err"}>
            {choiceErr}
          </span>
        )}
      </fieldset>

      {state.ok && state.message && (
        <p role="status" className={admin ? "a-ok" : "form-ok"}>
          {!admin && <TickIcon />}
          {state.message}
        </p>
      )}
      {state.message && !state.ok && (
        <p role="alert" className={admin ? "a-err" : "form-alert"}>
          {!admin && <AlertIcon />}
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save availability"}
      </Button>
      <p className={admin ? "a-hint" : "avail-hint"}>
        {admin
          ? "Taking on work shows for 14 days unless it's set again; booked up shows until its date. It never changes the order or a badge."
          : "Taking on work shows on your page and in lists for 14 days, so set it again while it's still true. Booked up shows until the date. It never changes where you're listed."}
      </p>
    </form>
  );
}
