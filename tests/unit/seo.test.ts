import { describe, expect, it } from "vitest";
import { toPriceGuide } from "@/lib/price-guides";
import {
  breadcrumbJsonLd,
  buildRobots,
  buildSitemap,
  categoryMetadata,
  homeJsonLd,
  priceGuideMetadata,
  priceIndexMetadata,
  providerJsonLd,
  providerMetadata,
  questionMetadata,
  serializeJsonLd,
  siteUrl,
  stripPhoneNumbers,
  truncate,
} from "@/lib/seo";

const BASE = "https://boltonvouched.ysbdesigns.uk";

describe("siteUrl", () => {
  it("uses NEXT_PUBLIC_SITE_URL without a trailing slash, else the production origin", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000/" })).toBe("http://localhost:3000");
    expect(siteUrl({})).toBe(BASE);
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "not a url" })).toBe(BASE);
  });
});

describe("buildRobots", () => {
  it("allows everything except admin, the API and private token links, and points at the sitemap", () => {
    expect(buildRobots(BASE)).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/platform/consent/", "/platform/link/", "/platform/d/"] },
      sitemap: `${BASE}/sitemap.xml`,
    });
  });
});

describe("buildSitemap", () => {
  const providers = [
    { slug: "ace", categorySlugs: ["plumber"], createdAt: "2026-01-01T00:00:00Z", lastReviewAt: "2026-03-01T00:00:00Z" },
    { slug: "fresh", categorySlugs: ["plumber", "electrician"], createdAt: "2026-02-01T00:00:00Z", lastReviewAt: null },
  ];
  const categories = [
    { slug: "plumber", liveCount: 2 },
    { slug: "electrician", liveCount: 1 },
    { slug: "roofer", liveCount: 0 },
  ];
  const map = buildSitemap({ categories, providers }, BASE);
  const urls = map.map((e) => e.url);

  it("lists home, the Get listed form, the directory, live categories, live providers and policy pages", () => {
    expect(urls).toEqual([
      `${BASE}/`,
      `${BASE}/get-listed`,
      `${BASE}/platform`,
      `${BASE}/platform/c/plumber`,
      `${BASE}/platform/c/electrician`,
      `${BASE}/platform/p/ace`,
      `${BASE}/platform/p/fresh`,
      `${BASE}/privacy`,
      `${BASE}/terms`,
      `${BASE}/how-ratings-work`,
      `${BASE}/review-policy`,
      `${BASE}/fake-reviews-policy`,
      `${BASE}/cookies`,
    ]);
  });

  it("leaves out empty categories and private paths", () => {
    expect(urls.some((u) => u.includes("roofer"))).toBe(false);
    expect(urls.some((u) => /admin|consent|\/api\//.test(u))).toBe(false);
  });

  it("dates entries from the newest provider activity", () => {
    const at = (u: string) => (map.find((e) => e.url === `${BASE}${u}`)?.lastModified as Date | undefined)?.toISOString();
    expect(at("/platform")).toBe("2026-03-01T00:00:00.000Z");
    expect(at("/platform/c/plumber")).toBe("2026-03-01T00:00:00.000Z");
    expect(at("/platform/c/electrician")).toBe("2026-02-01T00:00:00.000Z");
    expect(at("/platform/p/ace")).toBe("2026-03-01T00:00:00.000Z");
    expect(at("/platform/p/fresh")).toBe("2026-02-01T00:00:00.000Z");
    expect(at("/privacy")).toBeUndefined();
  });

  it("works with no providers at all", () => {
    expect(buildSitemap({ categories, providers: [] }, BASE).map((e) => e.url)).toEqual([
      `${BASE}/`,
      `${BASE}/get-listed`,
      `${BASE}/platform`,
      `${BASE}/platform/c/plumber`,
      `${BASE}/platform/c/electrician`,
      `${BASE}/privacy`,
      `${BASE}/terms`,
      `${BASE}/how-ratings-work`,
      `${BASE}/review-policy`,
      `${BASE}/fake-reviews-policy`,
      `${BASE}/cookies`,
    ]);
  });
});

describe("serializeJsonLd", () => {
  it("cannot be closed early by text in the data", () => {
    const evil = { bio: '</script><script>alert(1)</script> & <!-- "quoted" \u2028' };
    const out = serializeJsonLd(evil);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(out.toLowerCase()).not.toContain("</script");
    expect(JSON.parse(out)).toEqual(evil);
  });
});

describe("stripPhoneNumbers", () => {
  it.each([
    ["Call 07700 900301 any time", "Call any time"],
    ["Ring +44 7700 900301.", "Ring."],
    ["Office (01204) 123456 or mobile 07700-900-301", "Office or mobile"],
    ["Landline 01204 123 456", "Landline"],
  ])("removes numbers from %j", (input, expected) => {
    expect(stripPhoneNumbers(input)).toBe(expected);
  });

  it("keeps ordinary numbers", () => {
    expect(stripPhoneNumbers("Over 20 years, est. 2004, 24/7 call-outs")).toBe("Over 20 years, est. 2004, 24/7 call-outs");
  });
});

describe("truncate", () => {
  it("cuts on a word boundary with an ellipsis", () => {
    const t = truncate("word ".repeat(60), 50);
    expect(t.length).toBeLessThanOrEqual(50);
    expect(t.endsWith("word…")).toBe(true);
    expect(truncate("short", 50)).toBe("short");
  });
});

describe("page metadata", () => {
  it("category: Bolton title, BL areas, canonical and social image", () => {
    const m = categoryMetadata({ slug: "plumber", name: "Plumbers", liveCount: 3 });
    expect(m.title).toEqual({ absolute: "Plumbers in Bolton | Bolton Vouched" });
    expect(m.description).toContain("BL1 to BL7");
    expect(m.description).toContain("3 local pros");
    expect(m.alternates?.canonical).toBe("/platform/c/plumber");
    expect(JSON.stringify(m.openGraph)).toContain("/social.png");
    expect(m.robots).toBeUndefined();
  });

  it("empty category is noindex", () => {
    expect(categoryMetadata({ slug: "roofer", name: "Roofers", liveCount: 0 }).robots).toEqual({
      index: false,
      follow: true,
    });
  });

  it("provider: business and trade in the title, no phone numbers in the description", () => {
    const m = providerMetadata({
      slug: "ace",
      businessName: "Ace Plumbing",
      areas: ["BL1", "BL3"],
      bio: "Boilers and leaks. Call 07700 900301 or +447700900301.",
      trade: "Plumber",
    });
    expect(m.title).toEqual({ absolute: "Ace Plumbing — Plumber in Bolton | Bolton Vouched" });
    expect(m.description).toContain("BL1 and BL3");
    expect(m.description).toContain("Boilers and leaks.");
    expect(m.description).not.toMatch(/\d{6}/);
    expect(m.alternates?.canonical).toBe("/platform/p/ace");
  });

  it("provider: no generic social image, so the profile's own opengraph-image is used", () => {
    const m = providerMetadata({ slug: "ace", businessName: "Ace Plumbing", areas: [], bio: null, trade: null });
    expect(JSON.stringify(m.openGraph)).not.toContain("/social.png");
    expect(JSON.stringify(m.twitter)).not.toContain("/social.png");
    expect(m.openGraph).not.toHaveProperty("images");
    expect(m.twitter).not.toHaveProperty("images");
  });
});

describe("JSON-LD", () => {
  it("home describes the organisation and website", () => {
    const ld = homeJsonLd(BASE);
    const [org, site] = ld["@graph"];
    expect(org).toMatchObject({
      "@type": "Organization",
      name: "Bolton Vouched",
      url: `${BASE}/`,
      logo: `${BASE}/icons/icon-512.png`,
      email: "support@ysbdesigns.uk",
      areaServed: { name: "Bolton" },
      parentOrganization: { name: "YSB Ventures Ltd", alternateName: "YSB Designs" },
    });
    expect(site).toMatchObject({ "@type": "WebSite", url: `${BASE}/` });
  });

  it("provider is a LocalBusiness with areas but no phone, address or rating", () => {
    const ld = providerJsonLd({ slug: "ace", businessName: "Ace </script>", areas: ["BL1", "BL3"], trade: "Plumber" }, BASE);
    expect(ld).toMatchObject({ "@type": "LocalBusiness", name: "Ace </script>", url: `${BASE}/platform/p/ace` });
    expect(ld.areaServed).toEqual([
      { "@type": "Place", name: "BL1, Bolton" },
      { "@type": "Place", name: "BL3, Bolton" },
    ]);
    const keys = Object.keys(ld);
    for (const k of ["telephone", "address", "aggregateRating", "review"]) expect(keys).not.toContain(k);
    expect(serializeJsonLd(ld)).not.toContain("</script");
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers the trail from 1 with absolute URLs, and serializes safely", () => {
    const ld = breadcrumbJsonLd(
      [
        { name: "Trades", path: "/platform" },
        { name: "Plumber", path: "/platform/c/plumber" },
        { name: "Ace </script>", path: "/platform/p/ace" },
      ],
      BASE,
    );
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Trades", item: `${BASE}/platform` },
        { "@type": "ListItem", position: 2, name: "Plumber", item: `${BASE}/platform/c/plumber` },
        { "@type": "ListItem", position: 3, name: "Ace </script>", item: `${BASE}/platform/p/ace` },
      ],
    });
    expect(serializeJsonLd(ld)).not.toContain("</script");
  });
});

describe("community questions in the sitemap and metadata", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const q = (id: string, created: string, recs: number) => ({
    id,
    createdAt: created,
    closesAt: new Date(new Date(created).getTime() + 14 * 86400000).toISOString(),
    recommendationCount: recs,
  });
  const questions = [
    q("00000000-0000-0000-0000-0000000000a1", "2026-10-10T09:00:00Z", 2), // open, answered
    q("00000000-0000-0000-0000-0000000000a2", "2026-10-11T09:00:00Z", 0), // open, unanswered
    q("00000000-0000-0000-0000-0000000000a3", "2026-08-01T09:00:00Z", 1), // closed, recent
    q("00000000-0000-0000-0000-0000000000a4", "2026-05-01T09:00:00Z", 3), // closed, old
  ];

  it("lists the Ask page and only answered questions that are open or recent", () => {
    const urls = buildSitemap({ categories: [], providers: [], questions, now }, BASE).map((e) => e.url);
    expect(urls.filter((u) => u.includes("/platform/ask"))).toEqual([
      `${BASE}/platform/ask`,
      `${BASE}/platform/ask/00000000-0000-0000-0000-0000000000a1`,
      `${BASE}/platform/ask/00000000-0000-0000-0000-0000000000a3`,
    ]);
  });

  it("leaves the Ask page out while nothing is answered", () => {
    const urls = buildSitemap({ categories: [], providers: [], questions: [questions[1]], now }, BASE).map((e) => e.url);
    expect(urls.some((u) => u.includes("/platform/ask"))).toBe(false);
  });

  it("indexes a question page only once it has a recommendation, with no phone number in the title", () => {
    const base = { id: "00000000-0000-0000-0000-0000000000a1", categoryName: "Electrician", district: "BL3" };
    const unanswered = questionMetadata({ ...base, body: "Anyone know a good electrician in BL3?", recommendationCount: 0 });
    expect(unanswered.robots).toEqual({ index: false, follow: true });
    const answered = questionMetadata({ ...base, body: "Anyone know a good electrician? 07700 900123", recommendationCount: 2 });
    expect(answered.robots).toBeUndefined();
    expect((answered.title as { absolute: string }).absolute).not.toMatch(/\d{5}/);
    expect(answered.description).toContain("Electrician in BL3, Bolton. 2 recommendations from local people");
    expect(answered.alternates?.canonical).toBe("/platform/ask/00000000-0000-0000-0000-0000000000a1");
  });
});

describe("price guides in the sitemap and metadata", () => {
  const guide = toPriceGuide({
    category_slug: "gardener",
    category_name: "Gardener",
    group_slug: "home-trades",
    group_name: "Home & trades",
    review_count: 10,
    band_under_250: 4,
    band_250_1k: 4,
    band_1k_5k: 1,
    band_over_5k: 1,
    on_price_pct: 70,
    earliest_job_month: "2025-04-01",
    latest_job_month: "2026-09-01",
  })!;

  it("lists the index and each published guide, and nothing when there are none", () => {
    const urls = (priceGuides: { slug: string; latestJobMonth: string }[]) =>
      buildSitemap({ categories: [], providers: [], priceGuides }, BASE).map((e) => e.url);
    expect(urls([{ slug: "gardener", latestJobMonth: "2026-09-01" }])).toEqual(
      expect.arrayContaining([`${BASE}/platform/prices`, `${BASE}/platform/prices/gardener`]),
    );
    expect(urls([]).filter((u) => u.includes("/prices"))).toEqual([]);
  });

  it("titles the guide as the question, with a canonical and no noindex", () => {
    const m = priceGuideMetadata(guide);
    expect(m.title).toEqual({ absolute: "How much does a gardener cost in Bolton? | Bolton Vouched" });
    expect(m.alternates?.canonical).toBe("/platform/prices/gardener");
    expect(m.robots).toBeUndefined();
    expect(String(m.description)).toMatch(/^What Bolton residents paid, from 10 reviews of gardener jobs since April 2025\. 70% said the price matched the quote\. Most often: Under £250 and £250–£1,000\.$/);
    expect(String(m.description).length).toBeLessThanOrEqual(160);
  });

  it("keeps an empty index out of search results", () => {
    expect(priceIndexMetadata(0).robots).toEqual({ index: false, follow: true });
    expect(priceIndexMetadata(2).robots).toBeUndefined();
  });
});
