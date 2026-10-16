// Enquiry counts for the trader's dashboard and the admin's provider page (my_enquiry_stats / admin_enquiry_stats,
// migration 000029). An enquiry is a call or WhatsApp tap, one per person or device per Bolton day; the trader's own
// taps and the admin's don't count. Profile views aren't recorded, so there are none to show.

/** Enquiries before Pro is offered. Pro never changes ranking or badges. (settings.enquiry_threshold holds the same.) */
export const PRO_ENQUIRY_THRESHOLD = 5;

export type EnquiryCounts = { enquiries: number; calls: number; whatsapps: number };
export type EnquiryMonth = EnquiryCounts & { month: string };
export type EnquiryStats = {
  thisMonth: EnquiryCounts;
  allTime: EnquiryCounts;
  /** Six months, oldest first; the last is this month. */
  months: EnquiryMonth[];
  reviewsThisMonth: number;
};

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const counts = (v: unknown): EnquiryCounts => {
  const o = (v ?? {}) as Record<string, unknown>;
  return { enquiries: n(o.enquiries), calls: n(o.calls), whatsapps: n(o.whatsapps) };
};

/** The RPC's JSON, made safe to render (missing or odd values become 0). */
export function toEnquiryStats(raw: unknown): EnquiryStats {
  const o = (raw ?? {}) as Record<string, unknown>;
  const months = Array.isArray(o.months) ? o.months : [];
  return {
    thisMonth: counts(o.this_month),
    allTime: counts(o.all_time),
    months: months
      .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
      .filter((m) => typeof m.month === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.month))
      .map((m) => ({ month: m.month as string, ...counts(m) })),
    reviewsThisMonth: n(o.reviews_this_month),
  };
}

/** "1 enquiry", "3 enquiries". */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export type ChartBar = {
  month: string;
  /** "May" */
  short: string;
  /** "May 2026" */
  long: string;
  value: number;
  /** Bar height, 0 to 100 (per cent of the tallest; a zero month has none). */
  height: number;
  /** "May 2026: 3 enquiries (2 calls, 1 WhatsApp)" */
  label: string;
  current: boolean;
};

/** The six-month bars: heights against the busiest month (at least 1, so a quiet half-year isn't all full bars). */
export function chartBars(months: EnquiryMonth[]): ChartBar[] {
  const max = Math.max(1, ...months.map((m) => m.enquiries));
  return months.map((m, i) => {
    const d = new Date(`${m.month}T00:00:00Z`);
    const long = MONTH_YEAR.format(d);
    const detail =
      m.enquiries === 0 ? "" : ` (${plural(m.calls, "call", "calls")}, ${plural(m.whatsapps, "WhatsApp", "WhatsApps")})`;
    return {
      month: m.month,
      short: MONTH.format(d),
      long,
      value: m.enquiries,
      height: m.enquiries === 0 ? 0 : Math.max(4, Math.round((m.enquiries / max) * 100)),
      label: `${long}: ${plural(m.enquiries, "enquiry", "enquiries")}${detail}`,
      current: i === months.length - 1,
    };
  });
}

export type ProProgress = {
  /** Enquiries so far, capped at the threshold: "3 of 5". */
  count: number;
  of: number;
  reached: boolean;
  /** 0 to 100. */
  percent: number;
};

/** Progress towards Pro, counted on all-time enquiries. */
export function proProgress(allTime: number, threshold: number = PRO_ENQUIRY_THRESHOLD): ProProgress {
  const count = Math.min(Math.max(0, Math.floor(allTime)), threshold);
  return { count, of: threshold, reached: count >= threshold, percent: Math.round((count / threshold) * 100) };
}
