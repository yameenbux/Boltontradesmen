// The trader sign-up funnel for the admin (admin_signup_funnel, migration 000056). Client-safe.
import { FUNNEL_STEPS, type FunnelStep } from "@/lib/page-views";

export type Funnel = { days: number; steps: Record<FunnelStep, number>; listed: number };

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0;
};

/** The RPC's JSON, made safe to render (missing steps are 0). */
export function toFunnel(raw: unknown): Funnel {
  const o = (raw ?? {}) as Record<string, unknown>;
  const s = (o.steps ?? {}) as Record<string, unknown>;
  return {
    days: n(o.days),
    steps: Object.fromEntries(FUNNEL_STEPS.map((k) => [k, n(s[k])])) as Record<FunnelStep, number>,
    listed: n(o.listed),
  };
}

export const FUNNEL_LABEL: Record<FunnelStep, string> = {
  "for-traders": "Saw the For traders page",
  "get-listed": "Saw the Get listed request form",
  "trader-sign-in": "Reached the trader sign-in",
  "trader-form": "Signed in and saw the listing form",
};
