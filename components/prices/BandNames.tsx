import { PRICE_BAND_LABELS } from "@/lib/price-guides";
import type { ValueBand } from "@/lib/review-text";

/** "Under £250 and £250–£1,000", each band kept on one line so "£250–£1,000" never splits at the dash. */
export function BandNames({ bands }: { bands: ValueBand[] }) {
  return bands.map((band, i) => (
    <span key={band}>
      {i > 0 && (i === bands.length - 1 ? " and " : ", ")}
      <span className="nw">{PRICE_BAND_LABELS[band]}</span>
    </span>
  ));
}
