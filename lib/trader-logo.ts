import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { LOGO_TOO_BIG, LOGO_WRONG_TYPE, MAX_LOGO_BYTES } from "@/lib/brand";
import { PHOTO_HEIC } from "@/lib/pro";
import { PhotoError, sniffPhoto } from "@/lib/work-photos";

// A trader's logo, for the public 'trader-logos' bucket. Checked and re-encoded the way work photos are
// (lib/work-photos.ts): the type comes from the file's own bytes, it's turned upright, scaled to fit 512 pixels and
// stored as WebP (transparency kept), so no metadata is ever published.

const SIDE = 512;

export type PreparedLogo = { bytes: Buffer; mime: "image/webp" };

/** Checks the file and returns what to store. Throws PhotoError with a message for the trader. */
export async function prepareLogo(bytes: Uint8Array): Promise<PreparedLogo> {
  if (bytes.byteLength > MAX_LOGO_BYTES) throw new PhotoError(LOGO_TOO_BIG);
  const kind = sniffPhoto(bytes);
  if (kind === "heic") throw new PhotoError(PHOTO_HEIC);
  if (!kind) throw new PhotoError(LOGO_WRONG_TYPE);
  try {
    const data = await sharp(bytes, { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: SIDE, height: SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 100 })
      .toBuffer();
    return { bytes: data, mime: "image/webp" };
  } catch {
    throw new PhotoError(LOGO_WRONG_TYPE);
  }
}

/** `<providerId>/<random>.webp`, the only shape set_my_logo accepts. */
export function logoPath(providerId: string): string {
  return `${providerId}/${randomUUID()}.webp`;
}

/** The file from a form, or null when none was chosen. */
export function logoFile(fd: FormData, name = "logo"): File | null {
  const f = fd.get(name);
  return f instanceof File && f.size > 0 ? f : null;
}
