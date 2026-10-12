import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import type { Check } from "@/lib/checks";

export { BL_DISTRICTS } from "@/lib/districts";

export type PublicProvider = {
  id: string;
  slug: string;
  businessName: string;
  contactName: string | null;
  areas: string[];
  bio: string | null;
  isVerified: boolean;
  hasWhatsapp: boolean;
  categorySlugs: string[];
  checks: Check[];
  reviewCount: number;
  useAgainPct: number | null;
  onTimePct: number | null;
  onPricePct: number | null;
  tidyPct: number | null;
  score: number | null;
  lastReviewAt: string | null;
  createdAt: string;
};

export type Group = { id: string; name: string; slug: string; sort: number };
export type Category = {
  id: string;
  groupId: string;
  slug: string;
  name: string;
  guidanceNote: string | null;
  /** Number of live providers listed in this category (from provider_public). */
  liveCount: number;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function toProvider(r: any): PublicProvider {
  return {
    id: r.id,
    slug: r.slug,
    businessName: r.business_name,
    contactName: r.contact_name,
    areas: r.areas ?? [],
    bio: r.bio,
    isVerified: !!r.is_verified,
    hasWhatsapp: !!r.has_whatsapp,
    categorySlugs: r.category_slugs ?? [],
    checks: r.checks ?? [],
    reviewCount: r.review_count ?? 0,
    useAgainPct: r.use_again_pct,
    onTimePct: r.on_time_pct,
    onPricePct: r.on_price_pct,
    tidyPct: r.tidy_pct,
    score: r.score === null || r.score === undefined ? null : Number(r.score),
    lastReviewAt: r.last_review_at,
    createdAt: r.created_at,
  };
}

const time = (s: string | null) => (s ? new Date(s).getTime() : 0);

export const listCategoryGroups = cache(
  async (): Promise<{ group: Group; categories: Category[] }[]> => {
    const db = createPublicClient();
    const [groups, cats, live] = await Promise.all([
      db.from("category_groups").select("id, name, slug, sort").order("sort"),
      db.from("categories").select("id, group_id, slug, name, guidance_note").order("name"),
      // The public view only holds live providers; only their category slugs are read.
      db.from("provider_public").select("category_slugs"),
    ]);
    if (groups.error) throw new Error(`listCategoryGroups: ${groups.error.message}`);
    if (cats.error) throw new Error(`listCategoryGroups: ${cats.error.message}`);
    if (live.error) throw new Error(`listCategoryGroups: ${live.error.message}`);
    const liveCounts = new Map<string, number>();
    for (const p of live.data ?? []) {
      for (const slug of (p as any).category_slugs ?? []) liveCounts.set(slug, (liveCounts.get(slug) ?? 0) + 1);
    }
    return (groups.data ?? []).map((g: any) => ({
      group: { id: g.id, name: g.name, slug: g.slug, sort: g.sort },
      categories: (cats.data ?? [])
        .filter((c: any) => c.group_id === g.id)
        .map((c: any) => ({
          id: c.id,
          groupId: c.group_id,
          slug: c.slug,
          name: c.name,
          guidanceNote: c.guidance_note,
          liveCount: liveCounts.get(c.slug) ?? 0,
        })),
    }));
  },
);

export async function listProvidersInCategory(
  categorySlug: string,
  district?: string,
): Promise<{ ranked: PublicProvider[]; newcomers: PublicProvider[] }> {
  let q = createPublicClient()
    .from("provider_public")
    .select("*")
    .contains("category_slugs", [categorySlug]);
  if (district) q = q.contains("areas", [district]);
  const { data, error } = await q;
  if (error) throw new Error(`listProvidersInCategory: ${error.message}`);
  const all = (data ?? []).map(toProvider);
  // Ordering depends only on review data; nothing about payment is available here.
  const ranked = all
    .filter((p) => p.score !== null)
    .sort(
      (a, b) =>
        (b.score as number) - (a.score as number) ||
        b.reviewCount - a.reviewCount ||
        time(b.lastReviewAt) - time(a.lastReviewAt),
    );
  const newcomers = all
    .filter((p) => p.reviewCount < 3)
    .sort((a, b) => time(b.createdAt) - time(a.createdAt));
  return { ranked, newcomers };
}

export const getProvider = cache(async (slug: string): Promise<PublicProvider | null> => {
  const { data, error } = await createPublicClient()
    .from("provider_public")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getProvider: ${error.message}`);
  return data ? toProvider(data) : null;
});

export type LiveProviderSummary = {
  slug: string;
  categorySlugs: string[];
  createdAt: string;
  lastReviewAt: string | null;
};

/** Every live provider (the public view only holds live ones), with just what the sitemap needs. */
export async function listLiveProviders(): Promise<LiveProviderSummary[]> {
  const { data, error } = await createPublicClient()
    .from("provider_public")
    .select("slug, category_slugs, created_at, last_review_at")
    .order("slug");
  if (error) throw new Error(`listLiveProviders: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    slug: r.slug,
    categorySlugs: r.category_slugs ?? [],
    createdAt: r.created_at,
    lastReviewAt: r.last_review_at,
  }));
}
