// The live directory lives under /platform (the root is the showcase site). Every platform link goes through here.
export const PLATFORM_BASE = "/platform";

export function platformPath(...segments: string[]): string {
  const parts = segments.map((s) => s.replace(/^\/+|\/+$/g, "")).filter(Boolean).map(encodeURIComponent);
  return parts.length ? `${PLATFORM_BASE}/${parts.join("/")}` : PLATFORM_BASE;
}
