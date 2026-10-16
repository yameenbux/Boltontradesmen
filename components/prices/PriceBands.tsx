import { PRICE_BAND_LABELS, PRICE_BANDS, percent, type PriceGuide } from "@/lib/price-guides";

/**
 * What residents paid, as one horizontal bar per price band (the review form's four answers, in order). Each row says
 * its numbers in words ("40%, 4 of 10"), so the bars are decoration for sighted readers only. Bars are the share of
 * all reviews, not scaled to the biggest band, so a short bar always means few people.
 */
export function PriceBands({ guide }: { guide: PriceGuide }) {
  return (
    <figure className="pbands" aria-labelledby="pbands-title">
      <figcaption id="pbands-title">Total paid for the whole job</figcaption>
      <ul data-testid="price-bands">
        {PRICE_BANDS.map((band) => {
          const n = guide.bands[band];
          const pct = percent(n, guide.reviewCount);
          return (
            <li key={band} className="pband" data-testid="price-band">
              <div className="top">
                <span>{PRICE_BAND_LABELS[band]}</span>
                <span className="val">
                  <b>{pct}%</b> <small>({n} of {guide.reviewCount})</small>
                </span>
              </div>
              <div className="track" aria-hidden="true">
                {n > 0 && <div className="fill" style={{ width: `${Math.max(pct, 2)}%` }} />}
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
