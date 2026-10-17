import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { MAX_PHOTO_BYTES, PHOTO_HEIC, PHOTO_TOO_BIG, PHOTO_WRONG_TYPE } from "@/lib/pro";

// A Pro trader's work photo, for the public 'work-photos' bucket. The type is read from the file's own bytes, never
// its name or what the browser says. Every photo is turned upright, scaled to fit 1600 pixels and re-encoded as WebP,
// so no camera metadata (EXIF, GPS location, device) is ever published, and pages stay light.

export class PhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoError";
  }
}

export type PreparedPhoto = { bytes: Buffer; width: number; height: number; mime: "image/webp"; ext: "webp" };

const MAX_SIDE = 1600;

function startsWith(b: Uint8Array, bytes: number[], at = 0): boolean {
  return b.length >= at + bytes.length && bytes.every((x, i) => b[at + i] === x);
}
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** "jpg", "png", "webp", "heic" (an iPhone photo: HEIF brands) or null. */
export function sniffPhoto(b: Uint8Array): "jpg" | "png" | "webp" | "heic" | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8)) return "webp";
  if (startsWith(b, ascii("ftyp"), 4)) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return "heic";
  }
  return null;
}

/** Checks the file and returns what to store (WebP, upright, no metadata) with its size. Throws PhotoError. */
export async function prepareWorkPhoto(bytes: Uint8Array): Promise<PreparedPhoto> {
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new PhotoError(PHOTO_TOO_BIG);
  const kind = sniffPhoto(bytes);
  // sharp's prebuilt libvips can't decode HEIC (no HEVC), so say so plainly rather than "wrong type".
  if (kind === "heic") throw new PhotoError(PHOTO_HEIC);
  if (!kind) throw new PhotoError(PHOTO_WRONG_TYPE);
  try {
    // sharp writes no metadata unless asked (no withMetadata/withExif), so EXIF and GPS are dropped here.
    const { data, info } = await sharp(bytes, { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height, mime: "image/webp", ext: "webp" };
  } catch {
    throw new PhotoError(PHOTO_WRONG_TYPE);
  }
}

/** `<providerId>/<random>.webp` */
export function workPhotoPath(providerId: string): string {
  return `${providerId}/${randomUUID()}.webp`;
}
