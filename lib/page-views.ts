// The page view beacon's body: which page was seen. Client-safe (components/ViewBeacon.tsx sends it).

export type ViewKind = "profile" | "category" | "funnel";

/** The trader sign-up funnel's steps (migration 000056), in order. */
export const FUNNEL_STEPS = ["for-traders", "get-listed", "trader-sign-in", "trader-form"] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];
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
  if ((b.kind !== "profile" && b.kind !== "category" && b.kind !== "funnel") || typeof b.slug !== "string") return null;
  if (!/^[a-z0-9-]{1,80}$/.test(b.slug)) return null;
  if (b.kind === "funnel" && !(FUNNEL_STEPS as readonly string[]).includes(b.slug)) return null;
  return { kind: b.kind, slug: b.slug };
}
