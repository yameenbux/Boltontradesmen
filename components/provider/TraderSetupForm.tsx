"use client";

import { useActionState } from "react";
import { AlertIcon, ChevronDown, TickIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { submitTraderSetup } from "@/app/(platform)/provider/setup-actions";
import { BL_DISTRICTS, OTHER_DISTRICT } from "@/lib/districts";
import { LISTING_LIMITS } from "@/lib/listing-request";
import { FREE_FEATURES, PRO_FEATURES, PRO_PRICE } from "@/lib/pro-features";
import { ConsentParagraph } from "@/components/consent/ConsentParagraph";
import type { ConsentCard } from "@/lib/consent-shared";
import type { TraderSetupState } from "@/lib/trader-setup";

type Key = keyof NonNullable<TraderSetupState["errors"]>;

function Err({ k, msg }: { k: Key; msg: string | undefined }) {
  if (!msg) return null;
  return (
    <span id={`ts-${k}-err`} className="field-err">
      {msg}
    </span>
  );
}

/**
 * The trader's one form: name (only when the account has none), business, trade, area, mobile, Free or Pro with
 * what each gets, then the listing statement (the consent page's, word for word: its hash is the evidence) and the
 * two ticks. Sending it puts the listing live. Nothing is charged here.
 */
export function TraderSetupForm({
  needsName,
  trades,
  cards,
}: {
  needsName: boolean;
  trades: string[];
  cards: ConsentCard[];
}) {
  const [state, action, pending] = useActionState(submitTraderSetup, {} as TraderSetupState);
  const v = (k: string) => (typeof state.values?.[k] === "string" ? state.values[k] : "");
  // Uncontrolled: React resets the form after each send, back to these defaults (what was sent), so a refused send
  // keeps the plan they picked.
  const plan = v("plan");
  const err = state.errors ?? {};
  const points = cards.filter((c) => c.key !== "privacy" && c.key !== "controller");
  const agreement = cards.find((c) => c.key === "privacy");
  const controller = cards.find((c) => c.key === "controller");
  const invalid = (k: Key) =>
    err[k] ? { "aria-invalid": true as const, "aria-describedby": `ts-${k}-err` } : {};

  return (
    <form action={action} className="auth-form" data-testid="trader-setup">
      {needsName && (
        <>
          <label className="field">
            First name
            <input name="first_name" className="input" autoComplete="given-name" autoCapitalize="words" maxLength={30}
              required defaultValue={v("first_name")} {...invalid("first_name")} />
            <Err k="first_name" msg={err.first_name} />
          </label>
          <label className="field">
            Surname
            <input name="surname" className="input" autoComplete="family-name" autoCapitalize="words" maxLength={40}
              required defaultValue={v("surname")} {...invalid("surname")} />
            <Err k="surname" msg={err.surname} />
          </label>
        </>
      )}
      <label className="field">
        Business name
        <input name="business_name" className="input" autoComplete="organization" maxLength={LISTING_LIMITS.business_name}
          required defaultValue={v("business_name")} {...invalid("business_name")} />
        <Err k="business_name" msg={err.business_name} />
      </label>
      <label className="field">
        Your trade
        <span className="hint">For example plumber, electrician or dog groomer.</span>
        <input name="trade" className="input" list="ts-trades" maxLength={LISTING_LIMITS.trade} required
          defaultValue={v("trade")} {...invalid("trade")} />
        <Err k="trade" msg={err.trade} />
      </label>
      {trades.length > 0 && (
        <datalist id="ts-trades">
          {trades.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
      <label className="field">
        Where you&apos;re based
        <span className="select">
          <select name="district" className="input" required defaultValue={v("district")} key={v("district")}
            {...invalid("district")}>
            <option value="" disabled>
              Choose your area
            </option>
            {BL_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value={OTHER_DISTRICT}>Outside Bolton</option>
          </select>
          <ChevronDown />
        </span>
        <Err k="district" msg={err.district} />
      </label>
      <label className="field">
        Mobile number
        <span className="hint">Customers call and WhatsApp you on this. It isn&apos;t shown on your page.</span>
        <input name="phone" type="tel" className="input" autoComplete="tel" inputMode="tel" maxLength={LISTING_LIMITS.phone}
          required defaultValue={v("phone")} {...invalid("phone")} />
        <Err k="phone" msg={err.phone} />
      </label>

      <fieldset className="plan-choice" aria-describedby={err.plan ? "ts-plan-err" : undefined}>
        <legend className="avail-legend">Choose your listing</legend>
        <label className="plan-opt">
          <input type="radio" name="plan" value="free" required defaultChecked={plan === "free"} />
          <span className="plan-opt-body">
            <span className="plan-head">
              <b>Free</b>
              <span className="plan-price">
                <b>£0</b> for good
              </span>
            </span>
            <ul className="plan-list">
              {FREE_FEATURES.map((f) => (
                <li key={f}>
                  <TickIcon />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </span>
        </label>
        <label className="plan-opt plan-opt-pro">
          <input type="radio" name="plan" value="pro" defaultChecked={plan === "pro"} />
          <span className="plan-opt-body">
            <span className="plan-head">
              <b>Pro</b>
              <span className="plan-price">
                <b>£10</b> a month, or {PRO_PRICE.annual}
              </span>
            </span>
            <span className="plan-sub">Everything in Free, plus:</span>
            <ul className="plan-list">
              {PRO_FEATURES.map((f) => (
                <li key={f.title}>
                  <TickIcon />
                  <span>{f.title}</span>
                </li>
              ))}
            </ul>
            <span className="plan-note">Your listing goes live free now. Pay by card on your listing page and Pro switches on. Cancel any time.</span>
          </span>
        </label>
        <Err k="plan" msg={err.plan} />
      </fieldset>

      <section className="signup-consent" aria-labelledby="ts-consent-title">
        <h2 id="ts-consent-title" className="avail-legend">
          Before you go live
        </h2>
        <ul className="points points-plain">
          {points.map((card) => (
            <li key={card.key}>
              <ConsentParagraph card={card} />
            </li>
          ))}
        </ul>
        {controller && (
          <div className="controller">
            <ConsentParagraph card={controller} />
          </div>
        )}
      </section>

      <label className={`confirm-box${err.permission ? " has-err" : ""}`}>
        <input type="checkbox" name="permission" value="yes" required defaultChecked={v("permission") === "yes"}
          {...invalid("permission")} />
        <span>I&apos;m the owner or I have their permission, and you can contact me about this listing.</span>
      </label>
      <Err k="permission" msg={err.permission} />
      {agreement && (
        <label className={`confirm-box confirm-agree${err.agree ? " has-err" : ""}`}>
          <input type="checkbox" name="agree" value="yes" required defaultChecked={v("agree") === "yes"}
            {...invalid("agree")} />
          <ConsentParagraph card={agreement} />
        </label>
      )}
      <Err k="agree" msg={err.agree} />

      {state.message && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Putting you live…" : "Put my listing live"}
      </Button>
    </form>
  );
}
