import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The brand fonts for generated images (the profile's Open Graph image and the PNG badge), read from assets/fonts
// once per server and never fetched at request time. The pages get the same faces from next/font; ImageResponse
// can't use those (woff2), so the TTFs are kept here (SIL Open Font License, alongside them).
// Gloock-Regular-nokern.ttf is Gloock with its GPOS (kerning) table taken out: ImageResponse measured words without
// the kerning but drew them with it, which left uneven gaps between words.
type Font = { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" };

let fonts: Promise<Font[]> | null = null;

async function load(): Promise<Font[]> {
  const dir = join(process.cwd(), "assets", "fonts");
  const [gloock, semi, bold] = await Promise.all(
    ["Gloock-Regular-nokern.ttf", "Figtree-SemiBold.ttf", "Figtree-Bold.ttf"].map((f) => readFile(join(dir, f))),
  );
  return [
    { name: "Gloock", data: gloock, weight: 400, style: "normal" },
    { name: "Figtree", data: semi, weight: 600, style: "normal" },
    { name: "Figtree", data: bold, weight: 700, style: "normal" },
  ];
}

export function imageFonts(): Promise<Font[]> {
  if (!fonts) {
    fonts = load().catch((e) => {
      fonts = null; // try again next time rather than keeping the failure
      throw e;
    });
  }
  return fonts;
}
