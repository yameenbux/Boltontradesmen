// The trader dashboard's insights (my_insights, migration 000053): how many people saw their page, and with Pro, how
// many looked for their trade. Plus the quotes still waiting on an answer, for "Chase on WhatsApp".
import { docNumber, money, type TradeDoc } from "@/lib/trade-docs";

export type DemandTrade = { slug: string; name: string; pageViews: number; questions: number };
export type Insights = {
  views: { thisMonth: number; lastMonth: number };
  pro: boolean;
  /** Last 30 days, per trade on the listing. Null without Pro. */
  demand: DemandTrade[] | null;
};

const n = (v: unknown) => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0;
};

/** The RPC's JSON, made safe to render. */
export function toInsights(raw: unknown): Insights {
  const o = (raw ?? {}) as Record<string, unknown>;
  const v = (o.views ?? {}) as Record<string, unknown>;
  const d = o.demand as Record<string, unknown> | null | undefined;
  const trades = d && Array.isArray(d.trades) ? d.trades : null;
  return {
    views: { thisMonth: n(v.this_month), lastMonth: n(v.last_month) },
    pro: o.pro === true,
    demand: trades
      ? trades
          .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null && typeof t.name === "string")
          .map((t) => ({ slug: String(t.slug ?? ""), name: t.name as string, pageViews: n(t.page_views), questions: n(t.questions) }))
      : null,
  };
}

/** A quote is worth chasing this many days after it was sent. */
export const CHASE_AFTER_DAYS = 3;
const DAY_MS = 86_400_000;

export type Chase = { doc: TradeDoc; days: number };

/**
 * Sent quotes with no answer yet, sent at least 3 days ago and still open (no "valid until", or not passed, by
 * Bolton's date), oldest first.
 */
export function quotesToChase(docs: TradeDoc[], now: Date = new Date()): Chase[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
  return docs
    .filter((d) => d.kind === "quote" && d.status === "sent" && d.sent_at && (!d.until || d.until >= today))
    .map((d) => ({ doc: d, days: Math.floor((now.getTime() - new Date(d.sent_at as string).getTime()) / DAY_MS) }))
    .filter((c) => c.days >= CHASE_AFTER_DAYS)
    .sort((a, b) => b.days - a.days);
}

/** The WhatsApp message the trader sends to chase a quote (they can edit it before sending). */
export function chaseText(doc: TradeDoc, business: string, link: string): string {
  const first = doc.customer_name.trim().split(/\s+/)[0] || doc.customer_name;
  return (
    `Hi ${first}, just checking you got my quote ${docNumber(doc.kind, doc.number)} for ${doc.title} (${money(doc.total_pence)}). ` +
    `You can accept it here: ${link}\nAny questions, just ask. ${business}`
  );
}

/** wa.me link with the message filled in, or null without a mobile number (07...). */
export function chaseWhatsApp(doc: TradeDoc, business: string, link: string): string | null {
  if (!doc.customer_phone || !/^\+447\d{9}$/.test(doc.customer_phone)) return null;
  return `https://wa.me/${doc.customer_phone.slice(1)}?text=${encodeURIComponent(chaseText(doc, business, link))}`;
}
