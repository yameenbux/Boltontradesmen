// The page view beacon's body: which page was seen. Client-safe (components/ViewBeacon.tsx sends it).

export type ViewKind = "profile" | "category" | "funnel" | "arrival";

/** The trader sign-up funnel's steps (migration 000056), in order. */
export const FUNNEL_STEPS = ["for-traders", "get-listed", "trader-sign-in", "trader-form"] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];
/** Where an arrival came from (migrations 000057, 000058): Facebook, Instagram, WhatsApp, our printed posters. */
export const ARRIVAL_SOURCES = ["fb", "ig", "wa", "poster"] as const;
export type ArrivalSource = (typeof ARRIVAL_SOURCES)[number];

const REF_ALIASES: Record<string, ArrivalSource> = {
  fb: "fb", facebook: "fb", ig: "ig", instagram: "ig", wa: "wa", whatsapp: "wa", poster: "poster",
};

/**
 * Where this visit came from, or null: the link's ?ref= or ?utm_source= first (our own tagged links), then Facebook's
 * ?fbclid (added to every link clicked on Facebook), then the page the visitor came from.
 */
export function arrivalSource(search: string, referrer: string): ArrivalSource | null {
  const q = new URLSearchParams(search);
  for (const k of ["ref", "utm_source"]) {
    const v = REF_ALIASES[(q.get(k) ?? "").trim().toLowerCase()];
    if (v) return v;
  }
  if (q.has("fbclid")) return "fb";
  let host = "";
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(host)) return "fb";
  if (/(^|\.)instagram\.com$/.test(host)) return "ig";
  if (/(^|\.)whatsapp\.(com|net)$/.test(host) || host === "wa.me") return "wa";
  return null;
}

export type ViewBody = { kind: ViewKind; slug: string };

/** The beacon's JSON, or null when it isn't a page we count. */
export function viewBody(text: string): ViewBody | null {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  const b = (o ?? {}) as Record<string, unknown>;
  const kinds: readonly unknown[] = ["profile", "category", "funnel", "arrival"];
  if (!kinds.includes(b.kind) || typeof b.slug !== "string") return null;
  if (!/^[a-z0-9-]{1,80}$/.test(b.slug)) return null;
  if (b.kind === "funnel" && !(FUNNEL_STEPS as readonly string[]).includes(b.slug)) return null;
  if (b.kind === "arrival" && !(ARRIVAL_SOURCES as readonly string[]).includes(b.slug)) return null;
  return { kind: b.kind as ViewKind, slug: b.slug };
}
