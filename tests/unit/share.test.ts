import { describe, expect, it } from "vitest";
import {
  badgeAlt,
  badgeEmbedCode,
  badgePath,
  badgeShare,
  escapeMarkup,
  pageShare,
  parseBadgeFile,
  profileShare,
  profileShareText,
  profileUrl,
} from "@/lib/share";

const BASE = "https://boltonvouched.ysbdesigns.uk";

describe("profile sharing", () => {
  it("builds the profile link from the slug", () => {
    expect(profileUrl("ace-plumbing", BASE)).toBe(`${BASE}/platform/p/ace-plumbing`);
    expect(profileUrl("ace-plumbing")).toMatch(/^https?:\/\/[^/]+\/platform\/p\/ace-plumbing$/);
  });

  it("names the business and the site, nothing more", () => {
    expect(profileShareText(" Ace Plumbing ", `${BASE}/platform/p/ace`)).toBe(
      `Ace Plumbing on Bolton Vouched: ${BASE}/platform/p/ace`,
    );
  });

  it("gives the Web Share title and link, and a WhatsApp link with the message encoded", () => {
    const s = profileShare("smith-sons", "Smith & Sons", BASE);
    expect(s.url).toBe(`${BASE}/platform/p/smith-sons`);
    expect(s.title).toBe("Smith & Sons on Bolton Vouched");
    expect(s.whatsapp).toBe(
      `https://wa.me/?text=${encodeURIComponent(`Smith & Sons on Bolton Vouched: ${BASE}/platform/p/smith-sons`)}`,
    );
    // The ampersand can't end the text parameter early.
    expect(s.whatsapp).toContain("Smith%20%26%20Sons");
  });

  it("gives the trader's Share your page buttons the link as printed", () => {
    expect(pageShare("ace", "Ace", BASE)).toEqual({
      link: `${BASE}/platform/p/ace`,
      display: "boltonvouched.ysbdesigns.uk/platform/p/ace",
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`Ace on Bolton Vouched: ${BASE}/platform/p/ace`)}`,
    });
  });
});

describe("badge paths", () => {
  it("builds and parses /badge/<slug>.svg and .png", () => {
    expect(badgePath("ace-plumbing")).toBe("/badge/ace-plumbing.svg");
    expect(badgePath("ace-plumbing", "png")).toBe("/badge/ace-plumbing.png");
    expect(parseBadgeFile("ace-plumbing.svg")).toEqual({ slug: "ace-plumbing", format: "svg" });
    expect(parseBadgeFile("ace-2.png")).toEqual({ slug: "ace-2", format: "png" });
  });

  it("refuses anything that isn't a slug with a badge extension", () => {
    for (const f of ["ace", "ace.jpg", "ace.svg.png.exe", "../ace.svg", "Ace.svg", "ace%20x.svg", "-ace.svg", ".svg", "ace.SVG"]) {
      expect(parseBadgeFile(f)).toBeNull();
    }
  });
});

describe("embed code", () => {
  it("links the badge image to the profile with utm_source=badge, at 240×80", () => {
    expect(badgeEmbedCode("ace", "Ace Plumbing", BASE)).toBe(
      `<a href="${BASE}/platform/p/ace?utm_source=badge"><img src="${BASE}/badge/ace.svg" ` +
        `alt="Ace Plumbing — vouched in Bolton on Bolton Vouched" width="240" height="80"></a>`,
    );
  });

  it("escapes quotes, ampersands and angle brackets in the business name", () => {
    const code = badgeEmbedCode("smith", `Smith & Sons "The Best" <Builders> O'Neill`, BASE);
    expect(code).toContain(
      'alt="Smith &amp; Sons &quot;The Best&quot; &lt;Builders&gt; O&#39;Neill — vouched in Bolton on Bolton Vouched"',
    );
    // Exactly the attributes we wrote: nothing the name contains can open a new one or a new tag.
    expect(code.match(/"/g)).toHaveLength(10); // href, src, alt, width, height
    expect(code.match(/</g)).toHaveLength(3); // <a, <img, </a
    const alt = /alt="([^"]*)"/.exec(code)![1];
    const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
    expect(alt.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => entities[e])).toBe(
      `Smith & Sons "The Best" <Builders> O'Neill — vouched in Bolton on Bolton Vouched`,
    );
  });

  it("escapeMarkup covers & < > \" '", () => {
    expect(escapeMarkup(`a & b < c > d " e ' f`)).toBe("a &amp; b &lt; c &gt; d &quot; e &#39; f");
    expect(escapeMarkup("&amp;")).toBe("&amp;amp;");
  });

  it("badgeShare gives the preview, downloads and code together", () => {
    const b = badgeShare("ace", "Ace", BASE);
    expect(b).toMatchObject({ svg: "/badge/ace.svg", png: "/badge/ace.png", downloadName: "bolton-vouched-ace" });
    expect(b.alt).toBe(badgeAlt("Ace"));
    expect(b.embed).toBe(badgeEmbedCode("ace", "Ace", BASE));
  });
});
