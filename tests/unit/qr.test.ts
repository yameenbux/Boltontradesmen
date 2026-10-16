import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { qrSvg } from "@/lib/qr";

const URL = "https://boltonvouched.ysbdesigns.uk/r/ace-plumbing";

describe("qrSvg", () => {
  it("returns an SVG for a URL", async () => {
    const svg = (await qrSvg(URL)).trim();
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toMatch(/<path[^>]+d="M/);
  });

  it("uses error correction Q with a four-module quiet zone", async () => {
    const svg = await qrSvg(URL);
    const size = QRCode.create(URL, { errorCorrectionLevel: "Q" }).modules.size;
    expect(svg).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`);
    // The finder pattern's top row starts four modules in.
    expect(svg).toMatch(/stroke="#000000" d="M4 4\.5h7/);
  });

  it("is dark on white, whatever the theme", async () => {
    const svg = await qrSvg(URL);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('stroke="#000000"');
  });

  it("is deterministic and needs something to encode", async () => {
    expect(await qrSvg(URL)).toBe(await qrSvg(URL));
    await expect(qrSvg("")).rejects.toThrow();
  });
});
