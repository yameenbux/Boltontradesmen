// The trader sign-up funnel for the admin (admin_signup_funnel, migrations 000056 and 000057). Client-safe.
import { ARRIVAL_SOURCES, type ArrivalSource, FUNNEL_STEPS, type FunnelStep } from "@/lib/page-views";
import { HEARD_FROM, type HeardFrom } from "@/lib/heard-from";

export type Funnel = {
  days: number;
  steps: Record<FunnelStep, number>;
  arrivals: Record<ArrivalSource, number>;
  listed: number;
  /** New listings by their answer to "How did you hear about us?" ("unknown": no answer). */
  listedFrom: Record<HeardFrom | "unknown", number>;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0;
};

const pick = <K extends string>(keys: readonly K[], o: unknown) => {
  const r = (o ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, n(r[k])])) as Record<K, number>;
};

/** The RPC's JSON, made safe to render (missing values are 0). */
export function toFunnel(raw: unknown): Funnel {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    days: n(o.days),
    steps: pick(FUNNEL_STEPS, o.steps),
    arrivals: pick(ARRIVAL_SOURCES, o.arrivals),
    listed: n(o.listed),
    listedFrom: pick([...HEARD_FROM.map((h) => h.value), "unknown"] as const, o.listed_from),
  };
}

export const FUNNEL_LABEL: Record<FunnelStep, string> = {
  "for-traders": "Saw the For traders page",
  "get-listed": "Saw the Get listed request form",
  "trader-sign-in": "Reached the trader sign-in",
  "trader-form": "Signed in and saw the listing form",
};

export const ARRIVAL_LABEL: Record<ArrivalSource, string> = {
  fb: "Came from Facebook",
  ig: "Came from Instagram",
  wa: "Came from a WhatsApp link",
};
