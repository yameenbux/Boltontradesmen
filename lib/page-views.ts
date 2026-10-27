// The page view beacon's body: which page was seen. Client-safe (components/ViewBeacon.tsx sends it).

export type ViewKind = "profile" | "category";
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
  if ((b.kind !== "profile" && b.kind !== "category") || typeof b.slug !== "string") return null;
  if (!/^[a-z0-9-]{1,80}$/.test(b.slug)) return null;
  return { kind: b.kind, slug: b.slug };
}
