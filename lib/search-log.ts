// Home-search logging: what residents type, so we can see which trades are missing and how often search fails.
// Nothing identifies the person: no IP, cookie or device id is stored, and the text is cleaned first so a stray
// phone number, email or postcode-with-house-number doesn't end up in the logs. Lines go to the server log
// (Railway), read with scripts/search-report.mjs.

export const SEARCH_LOG_MAX = 40;

/** Lower-case, collapse spaces, mask digits, cap the length. Null when there's nothing safe to keep. */
export function cleanSearch(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let q = raw.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (!q || q.includes("@")) return null;
  q = q.replace(/\d/g, "#").slice(0, SEARCH_LOG_MAX).trim();
  return q || null;
}

export type SearchLogLine = { event: "home_search"; matched: boolean; category: string | null; q: string };

/** The JSON line written to the server log, or null when the body isn't a usable search. */
export function searchLogLine(body: unknown): SearchLogLine | null {
  const o = (body ?? {}) as Record<string, unknown>;
  const q = cleanSearch(o.q);
  if (!q || typeof o.matched !== "boolean") return null;
  const category = o.matched && typeof o.category === "string" && /^[a-z0-9-]{1,60}$/.test(o.category) ? o.category : null;
  return { event: "home_search", matched: o.matched, category, q };
}
