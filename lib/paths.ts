// The directory lives at the root of the site (it moved there from /platform: old links redirect, next.config.ts).
// Every directory link goes through here.
export const PLATFORM_BASE = "";

export function platformPath(...segments: string[]): string {
  const parts = segments.map((s) => s.replace(/^\/+|\/+$/g, "")).filter(Boolean).map(encodeURIComponent);
  return parts.length ? `${PLATFORM_BASE}/${parts.join("/")}` : "/";
}
