"use client";

import { useActionState, useState } from "react";
import { AlertIcon, TickIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { submitTraderSetup } from "@/app/(platform)/provider/setup-actions";
import { ConsentParagraph } from "@/components/consent/ConsentParagraph";
import type { ConsentCard } from "@/lib/consent-shared";
import { BL_DISTRICTS } from "@/lib/districts";
import { LISTING_LIMITS } from "@/lib/listing-request";
import { PLANS } from "@/lib/pro";
import { FREE_FEATURES, PRO_FEATURES, PRO_PRICE } from "@/lib/pro-features";
import { matchesTrade } from "@/lib/trade-words";
import { CHECK_TRADES, MAX_TRADES, type TraderSetupState } from "@/lib/trader-setup";

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
  proReady = false,
}: {
  needsName: boolean;
  groups: TradeGroup[];
  cards: ConsentCard[];
  /** Stripe is set up: choosing Pro goes straight to payment after Confirm. */
  proReady?: boolean;
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

      <TradePicker key={[...trades].join(",")} groups={groups} picked={trades} error={err.trades} />

      {/* Shown (CSS :has) when the trade is ticked; the server asks for them either way. */}
      {CHECK_TRADES.map((c) => (
        <fieldset key={c.kind} className={`ref-box ref-${c.slug}`} aria-describedby={`ts-${c.kind}-hint`}>
          <legend className="avail-legend">{c.label}</legend>
          <span id={`ts-${c.kind}-hint`} className="hint">
            {c.hint}
          </span>
          <label className="field">
            {c.label}
            <input name={`${c.kind}_ref`} className="input" autoComplete="off" maxLength={20}
              defaultValue={v(`${c.kind}_ref`)} {...invalid(c.kind)} />
          </label>
          <label className="field">
            {c.expiryLabel}
            <input name={`${c.kind}_expires`} type="date" className="input" defaultValue={v(`${c.kind}_expires`)}
              {...invalid(c.kind)} />
          </label>
          <Err k={c.kind} msg={err[c.kind]} />
        </fieldset>
      ))}

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
            <span className="plan-note">
              {proReady
                ? "After Confirm you go straight to secure card payment, and Pro switches on as soon as you've paid. If you stop, you're live on Free. Cancel any time."
                : "Pro opens soon. Your listing goes live free now, and you can add Pro from your listing page."}
            </span>
          </span>
        </label>
        {proReady && (
          <div className="pro-billing" data-testid="pro-billing">
            <span className="hint">How would you like to pay for Pro?</span>
            {PLANS.map((p) => (
              <label key={p.plan} className="tick">
                <input type="radio" name="pro_billing" value={p.plan}
                  defaultChecked={(v("pro_billing") || "monthly") === p.plan} />
                <span>
                  <b>{p.price}</b> · {p.note}
                </span>
              </label>
            ))}
          </div>
        )}
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

/**
 * "Your trade": a search box over the trades by group. Typing narrows the list to the trades whose name or words
 * start with what's typed ("venet", "polished plaster", "sparky"), opening their groups; clearing it shows the groups
 * again. Every tick box stays in the form (hidden ones too), so nothing ticked is lost while searching. What's ticked
 * is listed under the search, as a group may be closed. Remounted (key) when the server sends the form back.
 */
function TradePicker({ groups, picked, error }: { groups: TradeGroup[]; picked: Set<string>; error?: string }) {
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(picked));
  const searching = query.trim() !== "";
  const names = new Map(groups.flatMap((g) => g.trades.map((t) => [t.slug, t.name] as const)));
  const found = searching ? groups.flatMap((g) => g.trades).filter((t) => matchesTrade(query, t)).length : 0;

  function toggle(slug: string, on: boolean) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }

  return (
    <fieldset className="tick-group" aria-describedby={error ? "ts-trades-err" : "ts-trades-hint"}>
      <legend className="avail-legend">Your trade</legend>
      <span id="ts-trades-hint" className="hint">
        Tick up to {MAX_TRADES}. Search, or open a group.
      </span>
      <label className="field trade-search">
        <input
          type="search"
          className="input"
          placeholder="Search your trade, e.g. Venetian plaster"
          aria-label="Search your trade"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Enter searches; it mustn't send the form.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
      </label>
      {ticked.size > 0 && (
        <p className="trade-ticked" data-testid="trades-ticked">
          Ticked: {[...ticked].map((s) => names.get(s) ?? s).join(", ")}
        </p>
      )}
      {searching && found === 0 && (
        <p className="hint" role="status">
          Nothing matches &ldquo;{query.trim()}&rdquo;. Try another word, or tick the closest and WhatsApp us on 07466
          487591 to add your trade.
        </p>
      )}
      {groups.map((g) => {
        const shown = g.trades.filter((t) => !searching || matchesTrade(query, t));
        return (
          <details
            key={g.name}
            className="tick-section"
            hidden={searching && shown.length === 0}
            open={searching || g.trades.some((t) => picked.has(t.slug)) || undefined}
          >
            <summary>{g.name}</summary>
            <div className="tick-grid">
              {g.trades.map((t) => (
                <label key={t.slug} className="tick" hidden={searching && !shown.includes(t)}>
                  <input
                    type="checkbox"
                    name="trades"
                    value={t.slug}
                    defaultChecked={picked.has(t.slug)}
                    onChange={(e) => toggle(t.slug, e.target.checked)}
                  />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>
          </details>
        );
      })}
      <Err k="trades" msg={error} />
    </fieldset>
  );
}
