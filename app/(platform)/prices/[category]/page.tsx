import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ChatIcon } from "@/components/ask/QuestionCard";
import { BandNames } from "@/components/prices/BandNames";
import { PriceBands } from "@/components/prices/PriceBands";
import { Button } from "@/components/ui/Button";
import { platformPath } from "@/lib/paths";
import {
  PRICE_GUIDE_NOTE,
  guideQuestion,
  guideSource,
  mostCommonBands,
  tradeWords,
} from "@/lib/price-guides";
import { getPriceGuide, listPriceGuides } from "@/lib/price-guides-public";
import { priceGuideMetadata } from "@/lib/seo";

// Static and cookie-free. Rebuilt at most hourly, and when a review is posted, edited or moderated
// (revalidatePublicPages). Only published guides exist: a trade under the review threshold is a 404.
export const revalidate = 3600;

// Published guides are built with the site; a trade that qualifies later is rendered on its first request.
export const dynamicParams = true;

// A build that can't reach the database (no Supabase settings) prerenders none; each is then rendered on first request.
export async function generateStaticParams() {
  try {
    return (await listPriceGuides()).map((g) => ({ category: g.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const guide = await getPriceGuide((await params).category);
  return guide ? priceGuideMetadata(guide) : {};
}

const Info = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export default async function PriceGuidePage({ params }: { params: Promise<{ category: string }> }) {
  const guide = await getPriceGuide((await params).category);
  if (!guide) notFound();
  const top = mostCommonBands(guide.bands);
  const words = tradeWords(guide.slug, guide.name);
  // No JSON-LD here: price markup could read as a price list or an offer, which these totals are not.
  const trail = [
    { name: "Trades", path: platformPath() },
    { name: "Prices", path: platformPath("prices") },
    { name: guide.name, path: platformPath("prices", guide.slug) },
  ];

  return (
    <main className="guide">
      <Breadcrumbs trail={trail} />
      <h1 className="guide-title">{guideQuestion(guide)}</h1>
      <p className="page-sub" data-testid="guide-source">
        What Bolton residents told us they paid, {guideSource(guide)}.
      </p>

      <section className="guide-card" aria-label="What locals paid">
        <div className="guide-facts">
          <p data-testid="guide-most-common">
            <small>{top.length > 1 ? "Most common totals" : "Most common total"}</small> <b>
              <BandNames bands={top} />
            </b>
          </p>
          <p data-testid="guide-on-price">
            <b>{guide.onPricePct}%</b> <small>said the final price matched the quote</small>
          </p>
        </div>
        <PriceBands guide={guide} />
      </section>

      <p className="note" data-testid="guide-note">
        <Info />
        <span>{PRICE_GUIDE_NOTE}</span>
      </p>
      <p className="guide-small">
        Every figure comes from a review: the reviewer picks the band the whole job came to and says whether the price
        stuck to the quote. We show a trade only once it has enough reviews, and never break it down by area or by
        trader.
      </p>

      <div className="guide-actions">
        <Button href={platformPath("c", guide.slug)}>See {words.many} in Bolton</Button>
      </div>
      {/* A plain link: asking needs sign-in (cookies), and this page stays static. */}
      <a href={`${platformPath("ask", "new")}?category=${encodeURIComponent(guide.slug)}`} className="ask-nudge press lift">
        <span className="ask-ic" aria-hidden="true">
          <ChatIcon />
        </span>
        <span>
          <b>Not sure who to ask? Ask Bolton</b>
          <small>Ask the neighbours who they&apos;d recommend in your area.</small>
        </span>
      </a>
    </main>
  );
}
