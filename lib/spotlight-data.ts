import "server-only";
import sharp from "sharp";
import { logoUrl } from "@/lib/brand";
import { getProvider, listCategoryGroups } from "@/lib/directory";
import type { SpotlightInput } from "@/lib/spotlight";

/** A live listing's spotlight facts (lib/spotlight.ts), or null when there's no live listing at that slug. */
export async function spotlightInput(slug: string): Promise<(SpotlightInput & { logoPath: string | null }) | null> {
  const p = await getProvider(slug);
  if (!p) return null;
  const names = new Map(
    (await listCategoryGroups()).flatMap(({ categories }) => categories.map((c) => [c.slug, c.name] as const)),
  );
  return {
    slug: p.slug,
    businessName: p.businessName,
    areas: p.areas,
    hasWhatsapp: p.hasWhatsapp,
    checks: p.checks,
    idChecked: p.idChecked,
    reviewCount: p.reviewCount,
    availability: p.availability?.status ?? null,
    trades: p.categorySlugs.flatMap((s) => names.get(s) ?? []),
    logoPath: p.logoPath,
  };
}

/**
 * The trader's logo as a PNG data URL for the spotlight image, or null (none, or it couldn't be fetched: the image is
 * drawn without it). Logos are stored as WebP, which ImageResponse can't draw.
 */
export async function spotlightLogo(path: string | null): Promise<string | null> {
  const url = logoUrl(path);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const png = await sharp(Buffer.from(await res.arrayBuffer())).resize(300, 300, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}
