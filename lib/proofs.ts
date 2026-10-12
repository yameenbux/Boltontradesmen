import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { MAX_PROOF_BYTES, PROOF_TOO_BIG, PROOF_WRONG_TYPE } from "@/lib/review-form";

// Proof of a job (an invoice photo, the finished work, a PDF receipt). Only the admin ever sees it. The type is
// read from the file's own bytes, never from its name or what the browser says, and photos are re-encoded so no
// camera metadata (EXIF, GPS location, device) is stored.

export { MAX_PROOF_BYTES, PROOF_ACCEPT } from "@/lib/review-form";

export class ProofError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProofError";
  }
}

export type PreparedProof = {
  bytes: Buffer;
  mime: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  ext: "jpg" | "png" | "webp" | "pdf";
};

const WRONG_TYPE = PROOF_WRONG_TYPE;
const TOO_BIG = PROOF_TOO_BIG;

function startsWith(b: Uint8Array, bytes: number[], at = 0): boolean {
  return b.length >= at + bytes.length && bytes.every((x, i) => b[at + i] === x);
}
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

function sniff(b: Uint8Array): PreparedProof["ext"] | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8)) return "webp";
  if (startsWith(b, ascii("%PDF-"))) return "pdf";
  return null;
}

const MIME: Record<PreparedProof["ext"], PreparedProof["mime"]> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/** Checks the file and returns what to store: photos without metadata (turned upright), PDFs as uploaded. */
export async function prepareProof(bytes: Uint8Array): Promise<PreparedProof> {
  if (bytes.byteLength > MAX_PROOF_BYTES) throw new ProofError(TOO_BIG);
  const ext = sniff(bytes);
  if (!ext) throw new ProofError(WRONG_TYPE);
  if (ext === "pdf") return { bytes: Buffer.from(bytes), mime: MIME.pdf, ext };

  try {
    // sharp writes no metadata unless asked (no withMetadata/withExif), so EXIF and GPS are dropped here.
    const img = sharp(bytes, { failOn: "error" }).rotate();
    const out = ext === "jpg" ? img.jpeg({ quality: 88 }) : ext === "png" ? img.png() : img.webp({ quality: 88 });
    return { bytes: await out.toBuffer(), mime: MIME[ext], ext };
  } catch {
    throw new ProofError(WRONG_TYPE);
  }
}

type ProofStorage = {
  upload(path: string, body: Buffer, opts: { contentType: string; upsert: false }): Promise<{ error: unknown }>;
};

/** Uploads to `<reviewId>/<random>.<ext>` and returns that path. Throws if storage refuses. */
export async function uploadProof(reviewId: string, proof: PreparedProof, storage: ProofStorage): Promise<string> {
  const path = `${reviewId}/${randomUUID()}.${proof.ext}`;
  const { error } = await storage.upload(path, proof.bytes, { contentType: proof.mime, upsert: false });
  if (error) {
    const message = typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
    throw new Error(`proof upload failed: ${message}`);
  }
  return path;
}
