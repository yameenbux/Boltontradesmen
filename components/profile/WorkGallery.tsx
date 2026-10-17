import Image from "next/image";
import { workPhotoUrl, type PublicPhoto } from "@/lib/pro";

/**
 * The trader's own photos of their work (up to 6, in their order). Lazy-loaded; each opens full size. Served straight
 * from Storage's public bucket, already re-encoded at upload (lib/work-photos.ts), so next/image doesn't optimise them
 * again (and Next refuses to fetch from a local Supabase in development). Nothing renders without photos.
 */
export function WorkGallery({ photos, businessName }: { photos: PublicPhoto[]; businessName: string }) {
  const shown = photos.flatMap((p) => {
    const src = workPhotoUrl(p.path);
    return src ? [{ ...p, src }] : [];
  });
  if (shown.length === 0) return null;
  return (
    <section className="card gallery" aria-labelledby="work-title">
      <h2 id="work-title">Their work</h2>
      <ul className={shown.length === 1 ? "gallery-grid is-one" : "gallery-grid"}>
        {shown.map((p) => (
          <li key={p.path}>
            <a href={p.src} target="_blank" rel="noopener">
              <Image
                src={p.src}
                alt={`Work by ${businessName}`}
                width={p.width}
                height={p.height}
                loading="lazy"
                sizes="(max-width: 520px) 50vw, 240px"
                unoptimized
              />
            </a>
          </li>
        ))}
      </ul>
      <p className="gallery-note">Photos from the trader.</p>
    </section>
  );
}
