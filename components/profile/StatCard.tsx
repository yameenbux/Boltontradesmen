import { CountUp } from "@/components/CountUp";
import type { PublicProvider } from "@/lib/directory";

type Stats = Pick<PublicProvider, "reviewCount" | "score" | "useAgainPct" | "onTimePct" | "onPricePct" | "tidyPct">;

const reviews = (n: number) => `${n} review${n === 1 ? "" : "s"}`;

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
 * enough reviews for a score; until then, a calm "3 reviews needed for a score" card.
 */
export function StatCard({ stats }: { stats: Stats }) {
  if (stats.score === null || stats.useAgainPct === null) {
    return (
      <section className="stat stat-pending" aria-label="What people say">
        <p className="display">3 reviews needed for a score</p>
        <p>{stats.reviewCount === 0 ? "No reviews yet" : `${reviews(stats.reviewCount)} so far`}</p>
      </section>
    );
  }
  const bars = [
    { label: "Turned up when they said", pct: stats.onTimePct },
    { label: "Stuck to the quote", pct: stats.onPricePct },
    { label: "Left the place tidy", pct: stats.tidyPct },
  ].filter((b): b is { label: string; pct: number } => b.pct !== null);
  const quality = stats.score.toFixed(1);
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
