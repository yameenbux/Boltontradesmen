import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ProfileHeader, areasSummary } from "@/components/profile/ProfileHeader";
import { BRAND_COLORS, LOGO_TOO_BIG, LOGO_WRONG_TYPE, MAX_LOGO_BYTES, brandHex, isBrandColor, logoUrl } from "@/lib/brand";
import { PHOTO_HEIC } from "@/lib/pro";
import { logoPath, prepareLogo } from "@/lib/trader-logo";
import { PhotoError } from "@/lib/work-photos";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("prepareLogo", () => {
  it("re-encodes as WebP no bigger than 512 pixels, keeping transparency and dropping metadata", async () => {
    const input = await sharp({ create: { width: 1200, height: 600, channels: 4, background: { r: 30, g: 90, b: 80, alpha: 0.5 } } })
      .png()
      .withExif({ IFD0: { Make: "Canon", Model: "EOS" } })
      .toBuffer();
    const out = await prepareLogo(new Uint8Array(input));
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([512, 256]);
    expect(meta.hasAlpha).toBe(true);
    expect(meta.exif).toBeUndefined();
    expect(out.bytes.includes(Buffer.from("Canon"))).toBe(false);
  });

  it("never enlarges a small logo", async () => {
    const input = await sharp({ create: { width: 120, height: 120, channels: 3, background: "#9c3a25" } }).jpeg().toBuffer();
    const meta = await sharp((await prepareLogo(new Uint8Array(input))).bytes).metadata();
    expect([meta.width, meta.height]).toEqual([120, 120]);
  });

  it("refuses what isn't a JPEG, PNG or WebP, an iPhone HEIC plainly, and anything over 5 MB", async () => {
    await expect(prepareLogo(new TextEncoder().encode("<svg></svg>"))).rejects.toThrow(LOGO_WRONG_TYPE);
    const heic = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypheic"), 0, 0, 0, 0, ...Buffer.from("mif1heic")]);
    await expect(prepareLogo(heic)).rejects.toThrow(PHOTO_HEIC);
    await expect(prepareLogo(new Uint8Array(MAX_LOGO_BYTES + 1))).rejects.toThrow(LOGO_TOO_BIG);
    await expect(prepareLogo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))).rejects.toBeInstanceOf(PhotoError);
  });

  it("stores under the listing's own folder, in the one shape the database accepts", () => {
    expect(logoPath(ID)).toMatch(new RegExp(`^${ID}/[0-9a-f-]{36}\\.webp$`));
  });
});

describe("lib/brand", () => {
  it("builds the public address only for a well-formed path", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co/" };
    const path = `${ID}/${ID}.webp`;
    expect(logoUrl(path, env)).toBe(`https://x.supabase.co/storage/v1/object/public/trader-logos/${path}`);
    expect(logoUrl(`${ID}/../x.webp`, env)).toBeNull();
    expect(logoUrl(null, env)).toBeNull();
    expect(logoUrl(path, {})).toBeNull();
  });

  it("knows only its own colours, each dark enough for white text", () => {
    expect(isBrandColor("teal")).toBe(true);
    expect(isBrandColor("#ff0000")).toBe(false);
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
    };
    for (const c of BRAND_COLORS) expect(1.05 / (lum(brandHex(c.key)) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the profile header", () => {
  const text = (html: string) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const base = { businessName: "Cupping By Sajj", contactName: "Sajjaad Lala", trades: ["Cupping & hijama"], isVerified: false, badge: null };

  it("sums up all of Bolton, and lists anything else", () => {
    expect(areasSummary(["BL1", "BL2", "BL3", "BL4", "BL5", "BL6", "BL7"])).toEqual({ main: "All of Bolton", sub: "BL1–BL7" });
    expect(areasSummary(["BL1", "BL2", "BL3", "BL4", "BL5", "BL6", "BL7", "M26"]).sub).toBe("BL1–BL7, M26");
    expect(areasSummary(["BL3", "M26"])).toEqual({ main: "BL3, M26", sub: null });
  });

  it("shows the logo when there is one, else the initials, and the facts", () => {
    const withLogo = renderToString(
      createElement(ProfileHeader, { ...base, areas: ["BL3"], logo: "https://x.supabase.co/l.webp", hasWhatsapp: true, createdAt: "2026-10-26T18:49:00Z" }),
    );
    expect(withLogo).toContain("https://x.supabase.co/l.webp");
    expect(text(withLogo)).toContain("Covers BL3 Contact Call or WhatsApp Straight to them Listed Oct 2026 Free listing");
    const without = renderToString(createElement(ProfileHeader, { ...base, areas: [] }));
    expect(text(without)).toMatch(/^CB Cupping By Sajj/);
    expect(without).not.toContain("prof-cover");
  });

  it("draws the cover only when given a colour", () => {
    const html = renderToString(createElement(ProfileHeader, { ...base, areas: [], cover: "#1F5F5B" }));
    expect(html).toContain("prof-cover");
    expect(html).toContain("--cover:#1F5F5B");
  });
});
