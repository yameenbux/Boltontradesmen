import Image from "next/image";
import Link from "next/link";
import { areasSummary } from "@/components/profile/ProfileHeader";
import { brandHex, logoUrl } from "@/lib/brand";
import type { PublicProvider } from "@/lib/directory";
import { initials } from "@/lib/initials";
import { platformPath } from "@/lib/paths";

const reviews = (n: number) => `${n} review${n === 1 ? "" : "s"}`;

/**
 * "New on Bolton Vouched": the newest live listings, as a row of cards that scrolls sideways. Each shows only what the
 * trader set (logo or initials, trades, "Taking on work", where they cover) and how many reviews they have. Ordered by
 * when they joined, nothing else.
 */
export function NewTraders({ providers, tradeNames }: { providers: PublicProvider[]; tradeNames: Map<string, string> }) {
  if (providers.length === 0) return null;
  return (
    <section className="newbies" aria-labelledby="newbies-title">
      <h2 id="newbies-title">New on Bolton Vouched</h2>
      <ul className="newbies-row" data-testid="new-traders">
        {providers.map((p) => {
          const logo = logoUrl(p.logoPath);
          const cover = p.brandColor ? brandHex(p.brandColor) : null;
          const trades = p.categorySlugs.map((s) => tradeNames.get(s)).filter(Boolean).join(", ");
          return (
            <li key={p.id}>
              <Link href={platformPath("p", p.slug)} className="newbie press lift">
                <span className="newbie-id">
                  <span
                    className={logo ? "newbie-logo has-logo" : "newbie-logo"}
                    style={cover && !logo ? { background: cover, color: "#fff" } : undefined}
                    aria-hidden="true"
                  >
                    {logo ? <Image src={logo} alt="" width={48} height={48} unoptimized /> : initials(p.businessName)}
                  </span>
                  <span className="newbie-name">
                    <b>{p.businessName}</b>
                    {trades && <small>{trades}</small>}
                  </span>
                </span>
                <span className="newbie-tags">
                  {p.availability?.status === "taking" && <span className="tag tag-go">Taking on work</span>}
                  {p.areas.length > 0 && <span className="tag">{areasSummary(p.areas).main}</span>}
                  <span className="tag">
                    {p.reviewCount === 0 ? "New · be the first to review" : reviews(p.reviewCount)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
