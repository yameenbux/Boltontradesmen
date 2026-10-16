import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BandNames } from "@/components/prices/BandNames";
import { PriceIcon } from "@/components/prices/PriceIcon";
import { platformPath } from "@/lib/paths";
import { PRICE_GUIDE_MIN_REVIEWS, guideQuestion, mostCommonBands } from "@/lib/price-guides";
import { listPriceGuides } from "@/lib/price-guides-public";
import { priceIndexMetadata } from "@/lib/seo";

// Static and cookie-free; rebuilt at most hourly, and when a review changes (revalidatePublicPages).
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return priceIndexMetadata((await listPriceGuides()).length);
}

export default async function PricesPage() {
  const guides = await listPriceGuides();
  const trail = [
    { name: "Trades", path: platformPath() },
    { name: "Prices", path: platformPath("prices") },
  ];

  return (
    <main className="guide">
      <Breadcrumbs trail={trail} />
      <h1 className="page-title">What locals paid</h1>
      <p className="page-sub">
        What Bolton residents told us they paid for whole jobs, from their reviews. Totals, not hourly rates; always get
        a quote.
      </p>

      {guides.length > 0 ? (
        <>
          <ul className="list" data-testid="price-guides">
            {guides.map((g) => (
              <li key={g.slug}>
                <Link href={platformPath("prices", g.slug)} className="pguide press lift">
                  <span className="ask-ic" aria-hidden="true">
                    <PriceIcon />
                  </span>
                  <span>
                    <b>{guideQuestion(g)}</b>
                    <small>
                      Most often: <BandNames bands={mostCommonBands(g.bands)} /> · from {g.reviewCount} reviews
                    </small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="muted guide-more">More guides appear as more reviews come in.</p>
        </>
      ) : (
        <div className="empty cat-empty" data-testid="price-guides-empty">
          <p>
            <b>No price guides yet.</b>
          </p>
          <p>
            A trade gets one once it has {PRICE_GUIDE_MIN_REVIEWS} reviews from Bolton residents. More guides appear
            as more reviews come in.
          </p>
          <Link href={platformPath()} className="link">
            Browse the trades
          </Link>
        </div>
      )}
    </main>
  );
}
