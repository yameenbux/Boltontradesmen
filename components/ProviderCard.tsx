import Link from "next/link";
import type { PublicProvider } from "@/lib/directory";
import { initials } from "@/lib/initials";
import { AvailabilityChip } from "@/components/AvailabilityChip";
import { CountUp } from "@/components/CountUp";
import { RatingBadge } from "@/components/RatingBadge";
import { Pill } from "@/components/ui/Pill";
import { ratingBadge } from "@/lib/badges";
import { platformPath } from "@/lib/paths";

const Tick = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const reviews = (n: number) => `${n} review${n === 1 ? "" : "s"}`;
// Own line under the review count; the " · " separator is kept in the text (for screen readers) but not shown.
const verifiedJobs = (n: number) =>
  n > 0 ? (
    <span className="vj">
      <span className="sep"> · </span>
      {n} verified job{n === 1 ? "" : "s"}
    </span>
  ) : null;

/**
 * Category-page card: initials avatar, name, Verified pill, any earned rating badge and the trader's availability,
 * areas, and the score with the review count and how many of those are verified jobs (or how many reviews so far).
 */
export function ProviderCard({ provider: p }: { provider: PublicProvider }) {
  const scored = p.score !== null && p.useAgainPct !== null;
  const badge = ratingBadge(p);
  return (
    <Link href={platformPath("p", p.slug)} className="pcard press lift">
      <span className="avatar" aria-hidden="true">
        {initials(p.businessName)}
      </span>
      <span className="info">
        <span className="name">{p.businessName}</span>
        {(p.isVerified || badge || p.availability) && (
          <span className="pills">
            {p.isVerified && (
              <Pill tone="sage">
                <Tick />
                Verified
              </Pill>
            )}
            {badge && <RatingBadge badge={badge} />}
            {p.availability && <AvailabilityChip availability={p.availability} />}
          </span>
        )}
        {p.areas.length > 0 && <span className="meta">{p.areas.join(" · ")}</span>}
      </span>
      <span className="score" data-testid="score">
        {scored ? (
          <>
            <span className="pct">
              <CountUp to={p.useAgainPct as number} />%
            </span>
            <span className="lab">would use again</span>
            <span className="rev">
              {reviews(p.reviewCount)}
              {verifiedJobs(p.verifiedJobCount)}
            </span>
          </>
        ) : (
          <span className="pending">{p.reviewCount === 0 ? "No reviews yet" : `${reviews(p.reviewCount)} so far`}</span>
        )}
      </span>
    </Link>
  );
}
