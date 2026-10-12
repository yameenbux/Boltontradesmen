import type { MetadataRoute } from "next";
import { listCategoryGroups, listLiveProviders } from "@/lib/directory";
import { buildSitemap } from "@/lib/seo";

// Public data only (anon client over provider_public/categories, no cookies). Built per request so a
// provider set live today is listed today, and a build against an empty database never freezes an empty sitemap.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [groups, providers] = await Promise.all([listCategoryGroups(), listLiveProviders()]);
  return buildSitemap({ categories: groups.flatMap((g) => g.categories), providers });
}
