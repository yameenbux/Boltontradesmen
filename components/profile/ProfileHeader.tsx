import { AvailabilityChip } from "@/components/AvailabilityChip";
import { RatingBadge } from "@/components/RatingBadge";
import { Pill } from "@/components/ui/Pill";
import { updatedAgo, type Availability } from "@/lib/availability";
import type { RatingBadge as Badge } from "@/lib/badges";
import { initials } from "@/lib/initials";

const Tick = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * Centred profile header: initials avatar, Gloock name, "contact · trade", Verified pill, any earned rating badge
 * and areas covered, then the trader's availability with how fresh it is (just above the score card).
 */
export function ProfileHeader({
  businessName,
  contactName,
  trades,
  isVerified,
  badge,
  areas,
  availability = null,
}: {
  businessName: string;
  contactName: string | null;
  trades: string[];
  isVerified: boolean;
  badge: Badge | null;
  areas: string[];
  availability?: Availability | null;
}) {
  const who = [contactName, trades.join(", ")].filter(Boolean).join(" · ");
  return (
    <div className="prof-head stagger">
      <div className="avatar" aria-hidden="true">
        {initials(businessName)}
      </div>
      <h1>{businessName}</h1>
      {who && <div className="who">{who}</div>}
      {(isVerified || badge || areas.length > 0) && (
        <div className="row">
          {isVerified && (
            <Pill tone="sage">
              <Tick />
              Verified
            </Pill>
          )}
          {badge && <RatingBadge badge={badge} />}
          {areas.length > 0 && <span>Covers {areas.join(", ")}</span>}
        </div>
      )}
      {availability && (
        <div className="avail-row">
          <AvailabilityChip availability={availability} />
          <span className="avail-when">· {updatedAgo(availability.setAt)}</span>
        </div>
      )}
    </div>
  );
}
