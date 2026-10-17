// Search-engine plumbing: site URL, sitemap/robots builders, per-page metadata and JSON-LD.
// Pure functions (no server-only, no data fetching) so they can be unit tested; callers pass the data in.
import type { Metadata, MetadataRoute } from "next";
import { CONTACT_EMAIL } from "@/components/site/content";
import { platformPath } from "@/lib/paths";

export const SITE_NAME = "Bolton Vouched";
export const DEFAULT_SITE_URL = "https://boltonvouched.ysbdesigns.uk";
export const OPERATOR = { tradingName: "YSB Designs", legalName: "YSB Ventures Ltd", companyNumber: "16022339" };

/** Canonical origin, without a trailing slash. NEXT_PUBLIC_SITE_URL wins; production fallback otherwise. */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function absoluteUrl(path: string, base: string = siteUrl()): string {
  return new URL(path, `${base}/`).toString();
}

/** Paths crawlers must not visit. Consent and link URLs carry private tokens; admin and the API are not content. */
export const DISALLOWED_PATHS = ["/admin", "/api/", "/platform/consent/", "/platform/link/"] as const;

export const POLICY_PATHS = ["/privacy", "/terms", "/how-ratings-work", "/review-policy", "/fake-reviews-policy", "/cookies"] as const;

export function buildRobots(base: string = siteUrl()): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...DISALLOWED_PATHS] },
    sitemap: `${base}/sitemap.xml`,
  };
}

export type SitemapCategory = { slug: string; liveCount: number };
export type SitemapProvider = { slug: string; categorySlugs: string[]; createdAt: string; lastReviewAt: string | null };

const latest = (dates: (string | null | undefined)[]): Date | undefined => {
  let best = 0;
  for (const d of dates) {
    const t = d ? new Date(d).getTime() : NaN;
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best ? new Date(best) : undefined;
};

const providerUpdated = (p: SitemapProvider) => latest([p.createdAt, p.lastReviewAt]);

export type SitemapQuestion = { id: string; createdAt: string; closesAt: string; recommendationCount: number };
/** A closed question stays in the sitemap until this long after it was asked; an open one is always in. */
export const SITEMAP_QUESTION_DAYS = 90;

/** Community questions worth indexing: at least one recommendation, and still open or asked recently. */
export function sitemapQuestions(questions: SitemapQuestion[], now: Date = new Date()): SitemapQuestion[] {
  const recent = now.getTime() - SITEMAP_QUESTION_DAYS * 24 * 60 * 60 * 1000;
  return questions.filter(
    (q) =>
      q.recommendationCount > 0 &&
      (new Date(q.closesAt).getTime() > now.getTime() || new Date(q.createdAt).getTime() > recent),
  );
}

/**
 * "/", "/get-listed", "/platform", categories with live providers, every live provider, the Ask page and its
 * answered questions (when there are any), then the policy pages.
 */
export function buildSitemap(
  {
    categories,
    providers,
    questions = [],
    now = new Date(),
  }: { categories: SitemapCategory[]; providers: SitemapProvider[]; questions?: SitemapQuestion[]; now?: Date },
  base: string = siteUrl(),
): MetadataRoute.Sitemap {
  const url = (path: string) => absoluteUrl(path, base);
  const withDate = (entry: MetadataRoute.Sitemap[number], d: Date | undefined) =>
    d ? { ...entry, lastModified: d } : entry;

  const allUpdated = latest(providers.map((p) => providerUpdated(p)?.toISOString()));
  const entries: MetadataRoute.Sitemap = [
    { url: url("/"), changeFrequency: "monthly", priority: 1 },
    { url: url("/get-listed"), changeFrequency: "yearly", priority: 0.5 },
    withDate({ url: url(platformPath()), changeFrequency: "daily", priority: 0.9 }, allUpdated),
  ];

  const live = categories.filter((c) => c.liveCount > 0);
  for (const c of live) {
    const inCat = providers.filter((p) => p.categorySlugs.includes(c.slug));
    const d = latest(inCat.map((p) => providerUpdated(p)?.toISOString()));
    entries.push(withDate({ url: url(platformPath("c", c.slug)), changeFrequency: "daily", priority: 0.8 }, d));
  }
  for (const p of providers) {
    entries.push(
      withDate({ url: url(platformPath("p", p.slug)), changeFrequency: "weekly", priority: 0.7 }, providerUpdated(p)),
    );
  }
  const asked = sitemapQuestions(questions, now);
  if (asked.length > 0) {
    entries.push(
      withDate(
        { url: url(platformPath("ask")), changeFrequency: "daily", priority: 0.6 },
        latest(asked.map((q) => q.createdAt)),
      ),
    );
    for (const q of asked) {
      entries.push(
        withDate({ url: url(platformPath("ask", q.id)), changeFrequency: "weekly", priority: 0.5 }, latest([q.createdAt])),
      );
    }
  }
  for (const path of POLICY_PATHS) entries.push({ url: url(path), changeFrequency: "yearly", priority: 0.3 });
  return entries;
}

/**
 * JSON for a <script type="application/ld+json"> body. JSON.stringify alone lets text such as "</script>" close the
 * tag early, so every character that matters to the HTML parser is written as a \u escape (still valid JSON).
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Removes anything that looks like a phone number (9+ digits, allowing spaces, dots, dashes, brackets, a leading +). */
export function stripPhoneNumbers(text: string): string {
  return text
    .replace(/\+?\(?\d[\d\s().-]{6,}\d/g, (m) => ((m.match(/\d/g)?.length ?? 0) >= 9 ? " " : m))
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

export function truncate(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** "BL1", "BL1 and BL3", "BL1, BL3 and BL4". */
export function listAreas(areas: string[]): string {
  if (areas.length <= 1) return areas[0] ?? "";
  return `${areas.slice(0, -1).join(", ")} and ${areas[areas.length - 1]}`;
}

export const SOCIAL_IMAGE = {
  url: "/social.png",
  width: 1200,
  height: 630,
  alt: "Bolton Vouched: Anyone know a good…? Bolton already does.",
};

/**
 * Title, description, canonical, Open Graph and Twitter card for one page. Paths are resolved via metadataBase.
 * `ownImage` leaves the image out, for a page whose segment draws its own (a profile's opengraph-image.tsx), so the
 * generic social.png can't stand in for it.
 */
export function pageMetadata({
  title,
  description,
  path,
  type = "website",
  noindex = false,
  ownImage = false,
}: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "profile";
  noindex?: boolean;
  ownImage?: boolean;
}): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: type === "profile" ? "profile" : "website",
      url: path,
      siteName: SITE_NAME,
      locale: "en_GB",
      title,
      description,
      ...(ownImage ? {} : { images: [SOCIAL_IMAGE] }),
    },
    twitter: { card: "summary_large_image", title, description, ...(ownImage ? {} : { images: [SOCIAL_IMAGE.url] }) },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function categoryMetadata(c: { slug: string; name: string; liveCount: number }): Metadata {
  const title = `${c.name} in Bolton | ${SITE_NAME}`;
  const description =
    c.liveCount > 0
      ? `${plural(c.liveCount, "local pro", "local pros")} for ${c.name.toLowerCase()} in Bolton, recommended by local people. Covering BL1 to BL7 and nearby, with the checks we've made on each. Free, no sign-up to look.`
      : `${c.name} in Bolton, recommended by local people. Covering BL1 to BL7 and nearby. Free, no sign-up to look.`;
  // Empty categories are thin pages: keep them out of the index (and the sitemap) until someone is listed.
  return pageMetadata({ title, description, path: platformPath("c", c.slug), noindex: c.liveCount === 0 });
}

export function providerMetadata(p: {
  slug: string;
  businessName: string;
  areas: string[];
  bio: string | null;
  trade: string | null;
}): Metadata {
  const what = p.trade ? `${p.trade} in Bolton` : "Local pro in Bolton";
  const title = `${p.businessName} — ${what} | ${SITE_NAME}`;
  const areas = p.areas.length ? ` covering ${listAreas(p.areas)}` : "";
  const lead = `${p.businessName}: ${p.trade ? p.trade.toLowerCase() : "local pro"} in Bolton${areas}.`;
  const bio = p.bio ? stripPhoneNumbers(p.bio) : "";
  const description = truncate(bio ? `${lead} ${bio}` : `${lead} Recommended on ${SITE_NAME}.`, 160);
  // The image comes from app/platform/p/[slug]/opengraph-image.tsx.
  return pageMetadata({ title, description, path: platformPath("p", p.slug), type: "profile", ownImage: true });
}

/**
 * A community question's page. Indexed only once a resident has recommended a listed trader (an unanswered question
 * is a thin page). Nothing that looks like a phone number reaches the title or description.
 */
export function questionMetadata(q: {
  id: string;
  body: string;
  categoryName: string;
  district: string;
  recommendationCount: number;
}): Metadata {
  const title = `${truncate(stripPhoneNumbers(q.body), 70)} | ${SITE_NAME}`;
  const answered =
    q.recommendationCount > 0
      ? `${plural(q.recommendationCount, "recommendation", "recommendations")} from local people, each a trader listed on ${SITE_NAME}.`
      : `Asked by a local resident. Answers name traders listed on ${SITE_NAME}.`;
  const description = truncate(`${q.categoryName} in ${q.district}, Bolton. ${answered}`, 160);
  return pageMetadata({ title, description, path: platformPath("ask", q.id), noindex: q.recommendationCount === 0 });
}

export function homeJsonLd(base: string = siteUrl()) {
  const orgId = `${base}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: SITE_NAME,
        url: `${base}/`,
        logo: absoluteUrl("/icons/icon-512.png", base),
        email: CONTACT_EMAIL,
        areaServed: { "@type": "City", name: "Bolton" },
        parentOrganization: {
          "@type": "Organization",
          name: OPERATOR.legalName,
          alternateName: OPERATOR.tradingName,
          identifier: OPERATOR.companyNumber,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        name: SITE_NAME,
        url: `${base}/`,
        inLanguage: "en-GB",
        publisher: { "@id": orgId },
      },
    ],
  };
}

/**
 * LocalBusiness for a profile. Deliberately no telephone, address, reviews or aggregateRating: phone numbers never
 * leave the server, and Google treats review markup a site publishes about the businesses it lists as self-serving.
 */
export function providerJsonLd(
  p: { slug: string; businessName: string; areas: string[]; trade: string | null },
  base: string = siteUrl(),
) {
  const url = absoluteUrl(platformPath("p", p.slug), base);
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${url}#business`,
    name: p.businessName,
    url,
    ...(p.trade ? { knowsAbout: p.trade } : {}),
    areaServed: p.areas.length
      ? p.areas.map((a) => ({ "@type": "Place", name: `${a}, Bolton` }))
      : [{ "@type": "City", name: "Bolton" }],
  };
}

export type Crumb = { name: string; path: string };

/** BreadcrumbList for the trail shown at the top of a page (components/Breadcrumbs.tsx), with absolute URLs. */
export function breadcrumbJsonLd(crumbs: Crumb[], base: string = siteUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path, base),
    })),
  };
}
