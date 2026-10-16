import { availabilityLabel, type Availability } from "@/lib/availability";

const Dot = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="12" r="6" />
  </svg>
);

const Calendar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </svg>
);

/**
 * The trader's availability: "Taking on work" in green, "Booked up until 14 Nov" quieter. Set by the trader and
 * expiring by itself (lib/availability.ts); it never changes a list's order or a badge. The words always show.
 */
export function AvailabilityChip({ availability: a }: { availability: Availability }) {
  return (
    <span className={`pill pill-wrap pill-avail-${a.status}`} data-testid="availability">
      {a.status === "taking" ? <Dot /> : <Calendar />}
      {availabilityLabel(a)}
    </span>
  );
}
