// Pro, the optional paid tier for traders: £10 a month or £100 a year through Stripe Checkout (no VAT: below the
// threshold). It adds an ID check (publicly "ID checked"), up to 6 work photos on the profile and a monthly enquiry
// report. It never changes ranking, badges or list order, and the word "Pro" stays inside the trader's dashboard and
// the admin. Pure (no server-only), so the client forms and the unit tests can use it.
import type { EnquiryStats } from "@/lib/enquiries";

type Env = Record<string, string | undefined>;

export type Plan = "monthly" | "annual";
export const PLANS: { plan: Plan; label: string; price: string; note: string }[] = [
  { plan: "monthly", label: "Monthly", price: "£10 a month", note: "Cancel any time" },
  { plan: "annual", label: "Yearly", price: "£100 a year", note: "Two months free" },
];

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  prices: Record<Plan, string>;
};

/**
 * Stripe's settings, or null unless all four are set. Without them the dashboard says "Pro opens soon" and no
 * checkout is attempted (Stripe may not be set up in production yet).
 */
export function stripeConfig(env: Env = process.env): StripeConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  const monthly = env.STRIPE_PRICE_MONTHLY?.trim();
  const annual = env.STRIPE_PRICE_ANNUAL?.trim();
  if (!secretKey || !webhookSecret || !monthly || !annual) return null;
  return { secretKey, webhookSecret, prices: { monthly, annual } };
}

/** The webhook's signing secret alone (the route can check signatures before the rest is set up). */
export function webhookSecret(env: Env = process.env): string | null {
  return env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function isPlan(v: unknown): v is Plan {
  return v === "monthly" || v === "annual";
}

/**
 * Which plan a Stripe price is: our two price ids first, else the price's billing interval (a price made by hand in
 * the Dashboard still maps). Null for anything else.
 */
export function planForPrice(priceId: string | null | undefined, interval: string | null | undefined, env: Env = process.env): Plan | null {
  if (priceId && priceId === env.STRIPE_PRICE_MONTHLY?.trim()) return "monthly";
  if (priceId && priceId === env.STRIPE_PRICE_ANNUAL?.trim()) return "annual";
  if (interval === "month") return "monthly";
  if (interval === "year") return "annual";
  return null;
}

/** How long a failed payment keeps Pro on after the paid period (Stripe retries for about two weeks). */
export const PAST_DUE_GRACE_DAYS = 14;

/** The same rule as private.is_pro (migration 000030). */
export function isProStatus(status: string, currentPeriodEnd: string | null, now: Date = new Date()): boolean {
  if (status === "active" || status === "trialing") return true;
  if (status !== "past_due" || !currentPeriodEnd) return false;
  const end = new Date(currentPeriodEnd).getTime();
  return Number.isFinite(end) && now.getTime() < end + PAST_DUE_GRACE_DAYS * 86_400_000;
}

export const MAX_WORK_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const PHOTO_WRONG_TYPE = "Please choose a photo (JPEG, PNG or WebP).";
export const PHOTO_TOO_BIG = "Photos must be 5 MB or smaller.";
export const PHOTO_HEIC =
  "That's an iPhone HEIC photo, which we can't use yet. On your iPhone go to Settings, Camera, Formats and choose Most Compatible, or share the photo as a JPEG.";

export const DOCUMENT_KINDS = [
  ["photo_id", "Photo ID (passport or driving licence)"],
  ["insurance", "Insurance certificate"],
  ["accreditation", "Trade accreditation"],
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number][0];
export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  photo_id: "Photo ID",
  insurance: "Insurance",
  accreditation: "Accreditation",
};

/** The public address of a work photo in the public 'work-photos' bucket, or null without a Supabase URL. */
export function workPhotoUrl(path: string, env: Env = process.env): string | null {
  const base = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!base || !path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/work-photos/${encoded}`;
}

export type PublicPhoto = { path: string; width: number; height: number };

/** provider_public.photos, made safe to render (anything odd is dropped). */
export function toPublicPhotos(raw: unknown): PublicPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .filter((p) => typeof p.path === "string" && /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(p.path))
    .map((p) => ({
      path: p.path as string,
      width: typeof p.width === "number" && p.width > 0 ? p.width : 1200,
      height: typeof p.height === "number" && p.height > 0 ? p.height : 900,
    }))
    .slice(0, MAX_WORK_PHOTOS);
}

// ---------------------------------------------------------------- the trader's own Pro (my_pro_status)
export type ProSubscription = {
  plan: Plan;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: string | null;
};
export type ProDocument = {
  id: string;
  kind: DocumentKind;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
};
export type ProPhoto = { id: string; path: string; width: number; height: number; position: number };
export type ProStatus = {
  isPro: boolean;
  subscription: ProSubscription | null;
  idCheck: { status: "none" | "pending" | "approved" | "rejected"; reason: string | null; decidedAt: string | null };
  documents: ProDocument[];
  photos: ProPhoto[];
};

const str = (v: unknown) => (typeof v === "string" ? v : null);

export function toProStatus(raw: unknown): ProStatus {
  const o = (raw ?? {}) as Record<string, unknown>;
  const s = o.subscription as Record<string, unknown> | null | undefined;
  const id = (o.id_check ?? {}) as Record<string, unknown>;
  const idStatus = str(id.status);
  return {
    isPro: o.is_pro === true,
    subscription:
      s && typeof s === "object" && isPlan(s.plan) && typeof s.status === "string"
        ? {
            plan: s.plan,
            status: s.status,
            currentPeriodEnd: str(s.current_period_end),
            cancelAtPeriodEnd: s.cancel_at_period_end === true,
            graceUntil: str(s.grace_until),
          }
        : null,
    idCheck: {
      status: idStatus === "pending" || idStatus === "approved" || idStatus === "rejected" ? idStatus : "none",
      reason: str(id.reason),
      decidedAt: str(id.decided_at),
    },
    documents: (Array.isArray(o.documents) ? o.documents : [])
      .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
      .filter((d) => typeof d.id === "string" && typeof d.kind === "string" && d.kind in DOCUMENT_LABEL)
      .map((d) => ({
        id: d.id as string,
        kind: d.kind as DocumentKind,
        status: d.status === "approved" || d.status === "rejected" ? d.status : "pending",
        reason: str(d.reason),
        createdAt: str(d.created_at) ?? "",
        decidedAt: str(d.decided_at),
      })),
    photos: (Array.isArray(o.photos) ? o.photos : [])
      .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
      .filter((p) => typeof p.id === "string" && typeof p.path === "string")
      .map((p) => ({
        id: p.id as string,
        path: p.path as string,
        width: typeof p.width === "number" ? p.width : 1200,
        height: typeof p.height === "number" ? p.height : 900,
        position: typeof p.position === "number" ? p.position : 0,
      })),
  };
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
const day = (iso: string | null) => {
  if (!iso) return null;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : DAY.format(t);
};

/** The dashboard's one-line account of the subscription: what it is and what happens next. */
export function subscriptionLine(s: ProSubscription, isPro: boolean): { tone: "ok" | "warn" | "off"; text: string } {
  const plan = s.plan === "annual" ? "£100 a year" : "£10 a month";
  const end = day(s.currentPeriodEnd);
  if (s.status === "past_due") {
    const until = day(s.graceUntil);
    return isPro
      ? { tone: "warn", text: `Your last payment didn't go through. Update your card in Manage billing${until ? ` by ${until}` : ""} to keep Pro.` }
      : { tone: "off", text: "Pro has ended because a payment didn't go through. Update your card in Manage billing to restart it." };
  }
  if (isPro && s.cancelAtPeriodEnd) {
    return { tone: "warn", text: `Cancelled. Pro stays on until ${end ?? "the end of the paid period"}, then stops. You won't be charged again.` };
  }
  if (isPro) return { tone: "ok", text: `Pro is on (${plan}).${end ? ` It renews on ${end}.` : ""}` };
  if (s.status === "incomplete") return { tone: "warn", text: "Your payment hasn't finished yet. If it doesn't go through, nothing is charged." };
  return { tone: "off", text: "Pro has ended. Your listing and reviews stay as they were; your photos and the ID checked mark are hidden." };
}

// ---------------------------------------------------------------- the monthly report
// Contact taps carry no district or trade (and no tracking is added for one), so the report is by month: last full
// month's enquiries against the month before, and the busiest of the last six.
export type MonthlyReport = {
  month: string;
  /** "September 2026" */
  label: string;
  enquiries: number;
  calls: number;
  whatsapps: number;
  /** Change from the month before, or null when there's no month before. */
  change: number | null;
  previousLabel: string | null;
  busiest: { label: string; enquiries: number } | null;
};

const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (m: string) => MONTH_YEAR.format(new Date(`${m}T00:00:00Z`));

/** Last month's figures from the dashboard's six months (oldest first, this month last). Null with too little data. */
export function monthlyReport(stats: EnquiryStats): MonthlyReport | null {
  const months = stats.months;
  if (months.length < 2) return null;
  const last = months[months.length - 2];
  const before = months.length >= 3 ? months[months.length - 3] : null;
  const full = months.slice(0, -1);
  const top = full.reduce((a, b) => (b.enquiries > a.enquiries ? b : a), full[0]);
  return {
    month: last.month,
    label: monthLabel(last.month),
    enquiries: last.enquiries,
    calls: last.calls,
    whatsapps: last.whatsapps,
    change: before ? last.enquiries - before.enquiries : null,
    previousLabel: before ? monthLabel(before.month) : null,
    busiest: top && top.enquiries > 0 ? { label: monthLabel(top.month), enquiries: top.enquiries } : null,
  };
}

// ---------------------------------------------------------------- error codes from the Pro functions
export const PRO_ERRORS: Record<string, string> = {
  not_pro: "That's part of Pro, which isn't on for this listing.",
  not_your_listing: "That listing isn't linked to your account.",
  blocked: "Your account can't make changes. Contact us if you think that's wrong.",
  bad_kind: "Choose what the document is.",
  bad_path: "Something went wrong. Please try again.",
  bad_type: "Please upload a photo (JPEG, PNG or WebP) or a PDF.",
  bad_size: "Something went wrong with that photo. Please try another.",
  id_pending: "Your photo ID is already with us and waiting to be checked.",
  id_approved: "Your ID is already checked.",
  too_many_documents: "You've five documents waiting to be checked. We'll look at those first.",
  too_many_photos: `You've ${MAX_WORK_PHOTOS} photos already. Remove one to add another.`,
  photo_not_found: "That photo has already gone.",
  bad_order: "The photos changed while you were moving them. Please try again.",
};
