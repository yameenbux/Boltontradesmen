import type { MetadataRoute } from "next";
import { listCategoryGroups, listLiveProviders } from "@/lib/directory";
import { listPriceGuides } from "@/lib/price-guides-public";
import { listAnsweredQuestions } from "@/lib/questions-public";
import { buildSitemap } from "@/lib/seo";

// Public data only (anon client over provider_public, categories, question_public and price_guide_public; no cookies).
// Built per request so a provider set live today is listed today, and a build against an empty database never freezes
// an empty sitemap.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [groups, providers, questions, guides] = await Promise.all([
    listCategoryGroups(),
    listLiveProviders(),
    listAnsweredQuestions(),
    listPriceGuides(),
  ]);
  return buildSitemap({
    categories: groups.flatMap((g) => g.categories),
    providers,
    questions,
    priceGuides: guides.map((g) => ({ slug: g.slug, latestJobMonth: g.latestJobMonth })),
  });
}
