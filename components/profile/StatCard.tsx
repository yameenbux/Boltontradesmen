import { CountUp } from "@/components/CountUp";
import { shownQuality } from "@/lib/badges";
import type { PublicProvider } from "@/lib/directory";

type Stats = Pick<PublicProvider, "reviewCount" | "score" | "useAgainPct" | "onTimePct" | "onPricePct" | "tidyPct">;

const reviews = (n: number) => `${n} review${n === 1 ? "" : "s"}`;
/** Reviews before a score shows (provider_stats). */
const MIN_FOR_SCORE = 3;

const Star = ({ dim }: { dim?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" opacity={dim ? 0.35 : undefined} aria-hidden="true">
    <path d="m12 2 3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6Z" />
  </svg>
);

/** A sub-score with a bar that fills from 0 on mount (CSS, transform only; the server HTML has the final width). */
function BarRow({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="bar-row" data-testid="bar-row">
      <div className="top">
        <span>{label}</span>
        <b>{pct}%</b>
      </div>
      <div className="track" aria-hidden="true">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * "What people say": the big "would use again" percentage, sub-score bars and quality stars once there are
 * enough reviews for a score; until then, how far along they are (0, 1 or 2 of the 3), said as a start, not a lack.
 */
export function StatCard({ stats }: { stats: Stats }) {
  if (stats.score === null || stats.useAgainPct === null) {
    const n = Math.min(stats.reviewCount, MIN_FOR_SCORE);
    return (
      <section className="stat stat-pending" aria-label="What people say">
        <div className="pending-head">
          <p className="display">{n === 0 ? "New on Bolton Vouched" : `${reviews(n)} so far`}</p>
          <span className="pending-count">
            {n} of {MIN_FOR_SCORE} for a score
          </span>
        </div>
        <div className="pending-steps" aria-hidden="true">
          {Array.from({ length: MIN_FOR_SCORE }, (_, i) => (
            <span key={i} className={i < n ? "on" : undefined} />
          ))}
        </div>
        <p>
          {n === 0
            ? "No reviews yet. Their score shows once 3 customers have reviewed them."
            : `${MIN_FOR_SCORE - n} more review${MIN_FOR_SCORE - n === 1 ? "" : "s"} and their score shows here.`}
        </p>
      </section>
    );
  }
  const bars = [
    { label: "Turned up when they said", pct: stats.onTimePct },
    { label: "Stuck to the quote", pct: stats.onPricePct },
    { label: "Left the place tidy", pct: stats.tidyPct },
  ].filter((b): b is { label: string; pct: number } => b.pct !== null);
  const quality = shownQuality(stats.score);
  const filled = Math.min(5, Math.max(0, Math.round(stats.score)));
  return (
    <section className="stat" aria-label="What people say">
      <div className="big">
        <div className="num" data-testid="headline">
          <CountUp to={stats.useAgainPct} />%
        </div>
        <div className="txt">
          <b>would use again</b>
          <span>From {reviews(stats.reviewCount)} by Bolton residents</span>
        </div>
      </div>
      {bars.length > 0 && (
        <div className="bars">
          {bars.map((b) => (
            <BarRow key={b.label} label={b.label} pct={b.pct} />
          ))}
        </div>
      )}
      <div className="quality">
        <span>Quality of work</span>
        <span className="stars" role="img" aria-label={`${quality} out of 5`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} dim={i >= filled} />
          ))}
          <b aria-hidden="true">{quality}</b>
        </span>
      </div>
    </section>
  );
}
