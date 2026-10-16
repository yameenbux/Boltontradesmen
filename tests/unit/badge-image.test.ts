import { describe, expect, it } from "vitest";
import {
  BADGE_LISTED,
  BADGE_TEXT_ROOM,
  badgeLine,
  badgeName,
  badgeSvg,
  fitName,
  textWidth,
} from "@/lib/badge-image";

const texts = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

describe("badge text", () => {
  it("shows the earned badge, else the plain listing line", () => {
    expect(badgeLine("top")).toBe("Top rated");
    expect(badgeLine("high")).toBe("Highly rated");
    expect(badgeLine(null)).toBe(BADGE_LISTED);
    expect(BADGE_LISTED).toBe("Listed on Bolton Vouched");
  });

  it("never shows a phone number in the name", () => {
    expect(badgeName("  Ace   Plumbing 07700 900301 ")).toBe("Ace Plumbing");
    expect(badgeName("Unit 12 Joinery")).toBe("Unit 12 Joinery");
  });

  it("keeps a short name large and shrinks a longer one to fit", () => {
    expect(fitName("Ace Plumbing", BADGE_TEXT_ROOM)).toEqual({ text: "Ace Plumbing", size: 17 });
    const mid = fitName("Halliwell Plumbing & Heating", BADGE_TEXT_ROOM);
    expect(mid.size).toBeLessThan(17);
    expect(mid.text).toBe("Halliwell Plumbing & Heating");
    expect(textWidth(mid.text, mid.size)).toBeLessThanOrEqual(BADGE_TEXT_ROOM);
  });

  it("cuts a very long name short with an ellipsis at the smallest size", () => {
    const long = fitName("The Greater Bolton and District Property Maintenance Company", BADGE_TEXT_ROOM);
    expect(long.size).toBe(11.5);
    expect(long.text.endsWith("…")).toBe(true);
    expect(textWidth(long.text, long.size)).toBeLessThanOrEqual(BADGE_TEXT_ROOM);
  });
});

describe("badgeSvg", () => {
  it("is a 240×80 SVG with the mark, the kicker, the name and the badge", () => {
    const svg = badgeSvg({ businessName: "Pine Joinery", badge: "top" });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="240" height="80" viewBox="0 0 240 80"/);
    expect(texts(svg)).toEqual(["VOUCHED IN BOLTON", "Pine Joinery", "Top rated"]);
    expect(svg).toContain("<title>Pine Joinery — vouched in Bolton on Bolton Vouched</title>");
    expect(svg).toContain('d="m8.6 14.6 2.4 2.4 4.4-4.6"'); // the tick in the house
  });

  it("says Listed on Bolton Vouched without an earned badge, and draws no star", () => {
    const svg = badgeSvg({ businessName: "Fresh Pipes", badge: null });
    expect(texts(svg)).toEqual(["VOUCHED IN BOLTON", "Fresh Pipes", "Listed on Bolton Vouched"]);
    expect(svg).not.toContain("Top rated");
    expect(svg).not.toContain("Highly rated");
    expect(svg).not.toContain("m12 2 3 6.6");
  });

  it("escapes the business name so it can't break out of the SVG", () => {
    const svg = badgeSvg({ businessName: `S&S "B" <i>O'N</i>`, badge: "high" });
    expect(svg).not.toContain("<i>");
    expect(svg).not.toMatch(/&(?!(amp|lt|gt|quot|#39);)/); // every & starts an entity
    expect(texts(svg)[1]).toBe("S&amp;S &quot;B&quot; &lt;i&gt;O&#39;N&lt;/i&gt;");
    const long = badgeSvg({ businessName: `Smith & Sons "Best" <script>alert(1)</script>`, badge: null });
    expect(long).not.toContain("<script");
    expect(long).toContain('aria-label="Smith &amp; Sons &quot;Best&quot; &lt;script&gt;alert(1)&lt;/script&gt;');
    // Only our own elements: svg, title, rect ×2, nested svg, 3 paths, star svg + path, 3 texts.
    expect(svg.match(/<[a-z]/g)).toHaveLength(13);
  });
});
