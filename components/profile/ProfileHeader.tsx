import Image from "next/image";
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

const BOLTON = ["BL1", "BL2", "BL3", "BL4", "BL5", "BL6", "BL7"];

/** "All of Bolton" (with any areas beyond it) when every BL district is covered, else the list. */
export function areasSummary(areas: string[]): { main: string; sub: string | null } {
  if (BOLTON.every((a) => areas.includes(a))) {
    const rest = areas.filter((a) => !BOLTON.includes(a));
    return { main: "All of Bolton", sub: rest.length ? `BL1–BL7, ${rest.join(", ")}` : "BL1–BL7" };
  }
  return { main: areas.join(", "), sub: null };
}

const monthYear = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(iso));

/**
 * The profile's header: the trader's logo (else their initials) beside their name and trade, then the Verified, ID
 * checked and rating pills, their availability with how fresh it is, a strip of facts (where they work, how to reach
 * them, when they joined) and Share. With Pro and a chosen colour, a cover band in that colour sits behind the logo.
 * Pro never ranks or badges: the cover is only how the page looks.
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
  logo = null,
  cover = null,
  hasWhatsapp = false,
  createdAt = null,
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
  /** The logo's public address. */
  logo?: string | null;
  /** The Pro cover colour (a hex from lib/brand.ts). */
  cover?: string | null;
  hasWhatsapp?: boolean;
  createdAt?: string | null;
}) {
  const who = [contactName, trades.join(", ")].filter(Boolean).join(" · ");
  const where = areas.length > 0 ? areasSummary(areas) : null;
  return (
    <div
      className={cover ? "prof-head has-cover stagger" : "prof-head stagger"}
      style={cover ? ({ "--cover": cover } as React.CSSProperties) : undefined}
    >
      {cover && <div className="prof-cover" aria-hidden="true" />}
      <div className="prof-id">
        <span className={logo ? "prof-logo has-logo" : "prof-logo"} aria-hidden="true">
          {logo ? <Image src={logo} alt="" width={96} height={96} unoptimized priority /> : initials(businessName)}
        </span>
        <div className="prof-name">
          <h1>{businessName}</h1>
          {who && <div className="who">{who}</div>}
        </div>
      </div>
      {(isVerified || idChecked || badge) && (
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
        </div>
      )}
      {availability && (
        <div className="avail-row">
          <AvailabilityChip availability={availability} />{" "}
          <span className="avail-when">· {updatedAgo(availability.setAt)}</span>
        </div>
      )}
      {(where || createdAt) && (
        <dl className="prof-facts">
          {where && (
            <div>
              <dt>Covers</dt>
              <dd>
                <b>{where.main}</b>
                {where.sub && <span>{where.sub}</span>}
              </dd>
            </div>
          )}
          <div>
            <dt>Contact</dt>
            <dd>
              <b>{hasWhatsapp ? "Call or WhatsApp" : "By phone"}</b>
              <span>Straight to them</span>
            </dd>
          </div>
          {createdAt && (
            <div>
              <dt>Listed</dt>
              <dd>
                <b>{monthYear(createdAt)}</b>
                <span>Free listing</span>
              </dd>
            </div>
          )}
        </dl>
      )}
      {share}
    </div>
  );
}
