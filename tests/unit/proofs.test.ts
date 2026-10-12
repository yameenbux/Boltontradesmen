import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { MAX_PROOF_BYTES, prepareProof, ProofError, uploadProof } from "@/lib/proofs";

const PHOTO_OR_PDF = "Please upload a photo (JPEG, PNG or WebP) or a PDF.";
const TOO_BIG = "Files must be 10 MB or smaller.";

async function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 24, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "Apple", Model: "iPhone 15" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "53/1 34/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "2/1 26/1 0/1" },
    })
    .toBuffer();
}

describe("prepareProof (Review Focus 4)", () => {
  it("strips EXIF and GPS from a JPEG and keeps it a JPEG", async () => {
    const input = await jpegWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined(); // the fixture really carries EXIF
    const out = await prepareProof(new Uint8Array(input));
    expect(out.mime).toBe("image/jpeg");
    expect(out.ext).toBe("jpg");
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(out.bytes.includes(Buffer.from("iPhone"))).toBe(false);
  });

  it("keeps a PNG a PNG, and a WebP a WebP, without metadata", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#9c3a25" } })
      .png()
      .withExif({ IFD0: { Artist: "Someone" } })
      .toBuffer();
    const p = await prepareProof(new Uint8Array(png));
    expect(p).toMatchObject({ mime: "image/png", ext: "png" });
    expect((await sharp(p.bytes).metadata()).exif).toBeUndefined();

    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#46684a" } })
      .webp()
      .toBuffer();
    expect(await prepareProof(new Uint8Array(webp))).toMatchObject({ mime: "image/webp", ext: "webp" });
  });

  it("refuses HEIC with the photo-or-PDF message", async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(64)]);
    await expect(prepareProof(new Uint8Array(heic))).rejects.toThrow(new ProofError(PHOTO_OR_PDF));
  });

  it("refuses anything over 10 MB", async () => {
    const big = new Uint8Array(MAX_PROOF_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    await expect(prepareProof(big)).rejects.toThrow(TOO_BIG);
    expect(MAX_PROOF_BYTES).toBe(10 * 1024 * 1024);
  });

  it("stores a PDF exactly as uploaded", async () => {
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
    const out = await prepareProof(new Uint8Array(pdf));
    expect(out).toMatchObject({ mime: "application/pdf", ext: "pdf" });
    expect(Buffer.compare(out.bytes, pdf)).toBe(0);
  });

  it("goes by the file's bytes, never its name: a JPEG renamed x.pdf is a JPEG", async () => {
    const out = await prepareProof(new Uint8Array(await jpegWithGps()));
    expect(out.ext).toBe("jpg");
  });

  it("refuses empty files, text and broken images", async () => {
    await expect(prepareProof(new Uint8Array())).rejects.toThrow(PHOTO_OR_PDF);
    await expect(prepareProof(new Uint8Array(Buffer.from("hello there")))).rejects.toThrow(PHOTO_OR_PDF);
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 7)]);
    await expect(prepareProof(new Uint8Array(broken))).rejects.toThrow(PHOTO_OR_PDF);
  });
});

describe("uploadProof", () => {
  it("stores the file under the review's folder with a random name and the right type", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const path = await uploadProof(
      "33333333-3333-4333-8333-333333333333",
      { bytes: Buffer.from([1, 2, 3]), mime: "image/jpeg", ext: "jpg" },
      { upload },
    );
    expect(path).toMatch(/^33333333-3333-4333-8333-333333333333\/[0-9a-f-]{36}\.jpg$/);
    expect(upload).toHaveBeenCalledWith(path, Buffer.from([1, 2, 3]), { contentType: "image/jpeg", upsert: false });
  });

  it("throws when storage refuses the file", async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: "Bucket not found" } });
    await expect(
      uploadProof("r1", { bytes: Buffer.from([1]), mime: "application/pdf", ext: "pdf" }, { upload }),
    ).rejects.toThrow("Bucket not found");
  });
});
