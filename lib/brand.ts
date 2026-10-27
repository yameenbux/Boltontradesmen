// A trader's own look on their page: their logo (any plan) and, with Pro, a cover colour from a fixed set (the
// database allows only these names). Client-safe: the forms and the profile read it.

type Env = Record<string, string | undefined>;

export const MAX_LOGO_BYTES = 5 * 1024 * 1024;
export const LOGO_ACCEPT = "image/jpeg,image/png,image/webp";
export const LOGO_WRONG_TYPE = "Your logo must be a JPEG, PNG or WebP image.";
export const LOGO_TOO_BIG = "Your logo must be 5 MB or smaller.";

/** Cover colours: deep enough that white text on them passes contrast (4.5:1 or better). */
export const BRAND_COLORS = [
  { key: "brick", label: "Brick", hex: "#9C3A25" },
  { key: "forest", label: "Forest", hex: "#2F5A34" },
  { key: "teal", label: "Teal", hex: "#1F5F5B" },
  { key: "navy", label: "Navy", hex: "#22395E" },
  { key: "plum", label: "Plum", hex: "#5B3A6E" },
  { key: "ochre", label: "Ochre", hex: "#7A5418" },
  { key: "ink", label: "Charcoal", hex: "#2B211B" },
] as const;

export type BrandColor = (typeof BRAND_COLORS)[number]["key"];

export const isBrandColor = (v: unknown): v is BrandColor =>
  typeof v === "string" && BRAND_COLORS.some((c) => c.key === v);

export const brandHex = (key: BrandColor): string => BRAND_COLORS.find((c) => c.key === key)!.hex;

/** The public address of a logo in the 'trader-logos' bucket, or null. */
export function logoUrl(path: string | null | undefined, env: Env = process.env): string | null {
  const base = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!base || !path || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path)) return null;
  return `${base}/storage/v1/object/public/trader-logos/${path}`;
}
