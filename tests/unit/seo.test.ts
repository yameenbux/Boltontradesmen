import { describe, expect, it } from "vitest";
import {
  buildRobots,
  buildSitemap,
  categoryMetadata,
  homeJsonLd,
  providerJsonLd,
  providerMetadata,
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
  it("allows everything except admin, the API and consent links, and points at the sitemap", () => {
    expect(buildRobots(BASE)).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/platform/consent/"] },
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
    expect(JSON.stringify(m.openGraph)).toContain("/social.png");
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
