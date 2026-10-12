import type { MetadataRoute } from "next";
import { listCategoryGroups, listLiveProviders } from "@/lib/directory";
import { buildSitemap } from "@/lib/seo";

// Public data only (anon client over provider_public/categories, no cookies). Regenerated at most hourly.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [groups, providers] = await Promise.all([listCategoryGroups(), listLiveProviders()]);
  return buildSitemap({ categories: groups.flatMap((g) => g.categories), providers });
}
