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
 * Centred profile header: initials avatar, Gloock name, "contact · trade", Verified pill, "ID checked" (the trader's
 * photo ID seen by the admin; it comes with Pro but never says so), any earned rating badge and areas covered, then
 * the trader's availability with how fresh it is, and the Share button (just above the score card).
 */
export function ProfileHeader({
  businessName,
  contactName,
  trades,
  isVerified,
  idChecked = false,
  badge,
  areas,
  availability = null,
  share = null,
}: {
  businessName: string;
  contactName: string | null;
  trades: string[];
  isVerified: boolean;
  idChecked?: boolean;
  badge: Badge | null;
  areas: string[];
  availability?: Availability | null;
  /** The Share button (components/profile/ShareProfile.tsx). */
  share?: React.ReactNode;
}) {
  const who = [contactName, trades.join(", ")].filter(Boolean).join(" · ");
  return (
    <div className="prof-head stagger">
      <div className="avatar" aria-hidden="true">
        {initials(businessName)}
      </div>
      <h1>{businessName}</h1>
      {who && <div className="who">{who}</div>}
      {(isVerified || idChecked || badge || areas.length > 0) && (
        <div className="row">
          {isVerified && (
            <Pill tone="sage">
              <Tick />
              Verified
            </Pill>
          )}
          {idChecked && (
            <a href="#checks-title" className="id-mark" title="We've checked this trader's photo ID">
              <Pill tone="sage">
                <Tick />
                ID checked
              </Pill>
              <span className="sr-only"> (we&apos;ve checked this trader&apos;s photo ID)</span>
            </a>
          )}
          {badge && <RatingBadge badge={badge} />}
          {areas.length > 0 && <span>Covers {areas.join(", ")}</span>}
        </div>
      )}
      {availability && (
        <div className="avail-row">
          <AvailabilityChip availability={availability} />{" "}
          <span className="avail-when">· {updatedAgo(availability.setAt)}</span>
        </div>
      )}
      {share}
    </div>
  );
}
