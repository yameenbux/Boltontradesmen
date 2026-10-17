import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, PHOTO_HEIC, PHOTO_TOO_BIG, PHOTO_WRONG_TYPE } from "@/lib/pro";
import { PhotoError, prepareWorkPhoto, sniffPhoto, workPhotoPath } from "@/lib/work-photos";

async function jpegWithGps(width = 64, height = 48): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "Apple", Model: "iPhone 15" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "53/1 34/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "2/1 26/1 0/1" },
    })
    .toBuffer();
}

// The start of an iPhone HEIC file: a box size, then "ftyp" and the brand "heic".
const HEIC = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypheic"), 0, 0, 0, 0, ...Buffer.from("mif1heic")]);

describe("prepareWorkPhoto", () => {
  it("re-encodes as WebP with no EXIF or GPS, and gives its size", async () => {
    const input = await jpegWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await prepareWorkPhoto(new Uint8Array(input));
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(out.bytes.includes(Buffer.from("iPhone"))).toBe(false);
    expect([out.width, out.height]).toEqual([64, 48]);
  });

  it("scales big photos to fit 1600 pixels", async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#46684a" } }).jpeg().toBuffer();
    const out = await prepareWorkPhoto(new Uint8Array(big));
    expect([out.width, out.height]).toEqual([1600, 1200]);
  });

  it("refuses HEIC with a clear message", async () => {
    expect(sniffPhoto(HEIC)).toBe("heic");
    await expect(prepareWorkPhoto(HEIC)).rejects.toThrow(PHOTO_HEIC);
  });

  it("refuses PDFs, other files and anything over 5 MB", async () => {
    await expect(prepareWorkPhoto(new Uint8Array(Buffer.from("%PDF-1.7 ...")))).rejects.toThrow(PHOTO_WRONG_TYPE);
    await expect(prepareWorkPhoto(new Uint8Array([1, 2, 3]))).rejects.toThrow(PhotoError);
    await expect(prepareWorkPhoto(new Uint8Array(MAX_PHOTO_BYTES + 1))).rejects.toThrow(PHOTO_TOO_BIG);
  });

  it("refuses a broken image that only looks like a JPEG", async () => {
    await expect(prepareWorkPhoto(new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]))).rejects.toThrow(PHOTO_WRONG_TYPE);
  });

  it("stores under the listing's own folder", () => {
    expect(workPhotoPath("0b8e1f0a-1111-4222-8333-444455556666")).toMatch(
      /^0b8e1f0a-1111-4222-8333-444455556666\/[0-9a-f-]{36}\.webp$/,
    );
  });
});
