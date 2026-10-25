"use client";

import { useActionState } from "react";
import { AlertIcon, TickIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { submitTraderSetup } from "@/app/(platform)/provider/setup-actions";
import { ConsentParagraph } from "@/components/consent/ConsentParagraph";
import type { ConsentCard } from "@/lib/consent-shared";
import { BL_DISTRICTS } from "@/lib/districts";
import { LISTING_LIMITS } from "@/lib/listing-request";
import { FREE_FEATURES, PRO_FEATURES, PRO_PRICE } from "@/lib/pro-features";
import { MAX_TRADES, type TraderSetupState } from "@/lib/trader-setup";

type Key = keyof NonNullable<TraderSetupState["errors"]>;

/** The trades to tick, by group, as the directory lists them. */
export type TradeGroup = { name: string; trades: { slug: string; name: string }[] };

function Err({ k, msg }: { k: Key; msg: string | undefined }) {
  if (!msg) return null;
  return (
    <span id={`ts-${k}-err`} className="field-err">
      {msg}
    </span>
  );
}

/**
 * The trader's one form, in one step: name (only when the account has none), business, the trades and postcode
 * areas they tick, mobile and WhatsApp, Free or Pro, then Confirm. Above Confirm, the listing statement (the consent
 * page's, word for word: its hash is the evidence); pressing Confirm is their agreement. It goes live at once.
 * Uncontrolled throughout: React resets the form after each send, back to these defaults (what was sent), so a
 * refused send keeps everything they filled in.
 */
export function TraderSetupForm({
  needsName,
  groups,
  cards,
}: {
  needsName: boolean;
  groups: TradeGroup[];
  cards: ConsentCard[];
}) {
  const [state, action, pending] = useActionState(submitTraderSetup, {} as TraderSetupState);
  const sent = state.values !== undefined;
  const v = (k: string) => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : "");
  const picked = (k: string) => new Set(Array.isArray(state.values?.[k]) ? (state.values[k] as string[]) : []);
  const trades = picked("trades");
  const areas = picked("areas");
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

      <fieldset className="tick-group" aria-describedby={err.trades ? "ts-trades-err" : "ts-trades-hint"}>
        <legend className="avail-legend">Your trade</legend>
        <span id="ts-trades-hint" className="hint">
          Tick up to {MAX_TRADES}.
        </span>
        {groups.map((g) => (
          <details key={g.name} className="tick-section" open={g.trades.some((t) => trades.has(t.slug)) || undefined}>
            <summary>{g.name}</summary>
            <div className="tick-grid">
              {g.trades.map((t) => (
                <label key={t.slug} className="tick">
                  <input type="checkbox" name="trades" value={t.slug} defaultChecked={trades.has(t.slug)} />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>
          </details>
        ))}
        <Err k="trades" msg={err.trades} />
      </fieldset>

      <fieldset className="tick-group" aria-describedby={err.areas ? "ts-areas-err" : "ts-areas-hint"}>
        <legend className="avail-legend">Postcode areas you cover</legend>
        <span id="ts-areas-hint" className="hint">
          Tick all that apply.
        </span>
        <div className="tick-grid tick-grid-areas">
          {BL_DISTRICTS.map((d) => (
            <label key={d} className="tick">
              <input type="checkbox" name="areas" value={d} defaultChecked={areas.has(d)} />
              <span>{d}</span>
            </label>
          ))}
        </div>
        <Err k="areas" msg={err.areas} />
      </fieldset>

      <label className="field">
        Mobile number
        <span className="hint">Customers call you on this. It isn&apos;t shown on your page.</span>
        <input name="phone" type="tel" className="input" autoComplete="tel" inputMode="tel" maxLength={LISTING_LIMITS.phone}
          required defaultValue={v("phone")} {...invalid("phone")} />
        <Err k="phone" msg={err.phone} />
      </label>
      <label className="tick">
        <input type="checkbox" name="whatsapp_same" value="yes" defaultChecked={!sent || v("whatsapp_same") === "yes"} />
        <span>Customers can WhatsApp me on this number</span>
      </label>
      <label className="field">
        Different WhatsApp number (optional)
        <span className="hint">Only if you use WhatsApp on another mobile.</span>
        <input name="whatsapp" type="tel" className="input" autoComplete="off" inputMode="tel" maxLength={LISTING_LIMITS.phone}
          defaultValue={v("whatsapp")} {...invalid("whatsapp")} />
        <Err k="whatsapp" msg={err.whatsapp} />
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

      {state.message && (
        <p role="alert" className="form-alert">
          <AlertIcon />
          {state.message}
        </p>
      )}
      <div className="confirm-line" data-testid="confirm-line">
        <p>By pressing Confirm, you confirm this is your business (or you have the owner&apos;s permission), and:</p>
        {agreement && <ConsentParagraph card={agreement} />}
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Putting you live…" : "Confirm"}
      </Button>
    </form>
  );
}
