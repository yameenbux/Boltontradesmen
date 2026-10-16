import type { MetadataRoute } from "next";
import { listCategoryGroups, listLiveProviders } from "@/lib/directory";
import { listAnsweredQuestions } from "@/lib/questions-public";
import { buildSitemap } from "@/lib/seo";

// Public data only (anon client over provider_public/categories/question_public, no cookies). Built per request so a
// provider set live today is listed today, and a build against an empty database never freezes an empty sitemap.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [groups, providers, questions] = await Promise.all([
    listCategoryGroups(),
    listLiveProviders(),
    listAnsweredQuestions(),
  ]);
  return buildSitemap({ categories: groups.flatMap((g) => g.categories), providers, questions });
}
