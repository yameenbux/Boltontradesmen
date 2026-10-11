import Link from "next/link";
import type { PublicProvider } from "@/lib/directory";
import { initials } from "@/lib/initials";
import { CountUp } from "@/components/CountUp";
import { Pill } from "@/components/ui/Pill";
import { platformPath } from "@/lib/paths";

const Tick = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const reviews = (n: number) => `${n} review${n === 1 ? "" : "s"}`;

/** Category-page card: initials avatar, name, Verified pill, areas, and the score (or how many reviews so far). */
export function ProviderCard({ provider: p }: { provider: PublicProvider }) {
  const scored = p.score !== null && p.useAgainPct !== null;
  return (
    <Link href={platformPath("p", p.slug)} className="pcard press lift">
      <span className="avatar" aria-hidden="true">
        {initials(p.businessName)}
      </span>
      <span className="info">
        <span className="name">{p.businessName}</span>
        {p.isVerified && (
          <Pill tone="sage">
            <Tick />
            Verified
          </Pill>
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
            <span className="rev">{reviews(p.reviewCount)}</span>
          </>
        ) : (
          <span className="pending">{p.reviewCount === 0 ? "No reviews yet" : `${reviews(p.reviewCount)} so far`}</span>
        )}
      </span>
    </Link>
  );
}
