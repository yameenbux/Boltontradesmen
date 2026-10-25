// Line icon for a category, keyed by slug (all seed slugs in supabase/seed.sql). Unknown slugs get a generic icon.
// 24×24, stroke = currentColor, so the parent sets colour and size.

const ICONS: Record<string, React.ReactNode> = {
  // Home & trades
  plumber: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4Z" />,
  electrician: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
  "gas-boilers": (
    <path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8a7 7 0 0 0 7 7Z" />
  ),
  joiner: (
    <>
      <path d="m15 12-8.5 8.5a2.1 2.1 0 0 1-3-3L12 9" />
      <path d="M17.6 15 22 10.6M20.9 11.7l-6.6-6.6a3 3 0 0 0-4.2 0L8 7.2l4.5.5 4.2 4.2.5 4.5" />
    </>
  ),
  plasterer: (
    <>
      <path d="M8 12h12l-4-8H8Z" />
      <path d="M10 14 3 21" />
      <path d="M8 12v2h2" />
    </>
  ),
  "painter-decorator": <path d="M9 14 4 19a2 2 0 0 0 3 3l5-5M14 4l6 6-7 7-6-6Z" />,
  roofer: (
    <>
      <path d="M2 12 12 4l10 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  handyman: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M9 8V5h6v3M3 13h18M10 13v2M14 13v2" />
    </>
  ),
  tiler: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 4v16M4 12h16" />
    </>
  ),
  locksmith: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 9-9M17 6l3 3M15 8l2 2" />
    </>
  ),
  gardener: (
    <>
      <path d="M12 21v-9" />
      <path d="M12 12C12 7 8.5 4 4 4c0 5 3.5 8 8 8ZM12 15c0-4.5 3-7.5 8-7.5 0 4.5-3 7.5-8 7.5Z" />
    </>
  ),
  "ev-solar": (
    <>
      <rect x="3" y="4" width="13" height="9" rx="1" />
      <path d="M3 8.5h13M9.5 4v9M9.5 13v3M6 20h7M20 9l-2 4h3l-2 4" />
    </>
  ),
  carpets: (
    <>
      <path d="M4 7a3 3 0 0 1 6 0v10a3 3 0 0 1-6 0Z" />
      <path d="M7 4h11a2 2 0 0 1 2 2v10H10" />
      <path d="M7 10v1" />
    </>
  ),
  "kitchen-fitter": (
    <>
      <rect x="3" y="10" width="18" height="10" rx="1" />
      <path d="M3 14h18M12 10v10M7 4h10v3H7ZM12 7v3" />
    </>
  ),
  "bedrooms-wardrobes": (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M12 3v18M10 11v2M14 11v2" />
    </>
  ),
  "window-cleaner": (
    <>
      <rect x="3" y="3" width="12" height="12" rx="1" />
      <path d="M9 3v12M3 9h12M15 15l6 6M18 13l-3 3" />
    </>
  ),
  "bathroom-fitter": (
    <>
      <path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Z" />
      <path d="M6 12V6a2 2 0 0 1 4 0M8 20l-1 2M16 20l1 2" />
    </>
  ),
  "driveways-paving": (
    <>
      <path d="M8 3 4 21M16 3l4 18" />
      <path d="M6 9h12M5 15h14M12 3v3M12 11v2M12 17v4" />
    </>
  ),
  "gutter-cleaning": (
    <>
      <path d="M3 6h18l-2 4H5Z" />
      <path d="M17 10v7a2 2 0 0 1-2 2" />
      <path d="M8 14c0 1.5 1 2.5 1 3.5a1 1 0 0 1-2 0c0-1 1-2 1-3.5Z" />
    </>
  ),
  cleaner: (
    <>
      <path d="m11 3 1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8Z" />
      <path d="M19 15v6M16 18h6" />
    </>
  ),
  bricklayer: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3 12h18M9 5v7M15 12v7" />
    </>
  ),
  "pest-control": (
    <>
      <rect x="8" y="7" width="8" height="13" rx="4" />
      <path d="M12 7V5M9 3l1.5 2.5M15 3l-1.5 2.5M8 11H4M8 15H4M16 11h4M16 15h4M12 11v9" />
    </>
  ),

  // Repairs & appliances
  "appliance-repair": (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="13" r="4" />
      <path d="M8 6.5h.01M11 6.5h.01" />
    </>
  ),
  "heating-repair": (
    <>
      <path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0Z" />
      <path d="M12 9v7" />
    </>
  ),
  "phone-computer-repair": (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 20h20" />
    </>
  ),
  "window-door-repair": (
    <>
      <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18" />
      <path d="M14.5 12h.01" />
    </>
  ),

  // Moving & waste
  "rubbish-removal": <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6" />,
  "man-and-van": (
    <>
      <path d="M2 17V6h11v11M13 9h5l4 4v4h-2M7 17h8" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  "skip-hire": (
    <>
      <path d="M2 8h20l-3 11H5Z" />
      <path d="M6 8 5 5M18 8l1-3M9 12v3M15 12v3" />
    </>
  ),
  accountants: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8M8 12h2M12 12h2M16 12v5M8 16h2M12 16h2" />
    </>
  ),
  "travel-agents": (
    <>
      <path d="M2 16 22 7l-3 7-7 1-2 5-2-4Z" />
      <path d="M10 15 22 7" />
    </>
  ),
  "estate-agents": (
    <>
      <path d="M3 11 10 5l7 6v9H3Z" />
      <path d="M8 20v-5h4v5M17 8h4v6h-4M19 14v6" />
    </>
  ),
  "house-clearance": (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),

  // Events & occasions
  caterer: <path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 9V7M10 7h4" />,
  "bouncy-castles": <path d="M3 21V9l3 2V6l3 2 3-4 3 4 3-2v5l3-2v12ZM10 21v-4a2 2 0 0 1 4 0v4" />,
  dj: (
    <>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3ZM3 19a2 2 0 0 0 2 2h1v-6H3Z" />
    </>
  ),
  cakes: <path d="M4 21h16v-8H4ZM4 16c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 4 0M12 13V8M12 5a1.5 1.5 0 0 0 0-3" />,
  decor: (
    <>
      <path d="M12 16c3.5 0 6-3 6-6.5a6 6 0 0 0-12 0C6 13 8.5 16 12 16Z" />
      <path d="m12 16-1 2h2ZM12 18c0 2-2 2-2 4" />
    </>
  ),
  photographer: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  entertainer: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
  florist: (
    <>
      <circle cx="12" cy="8" r="2" />
      <path d="M12 6a2.5 2.5 0 1 1 2 2M10 8a2.5 2.5 0 1 1 2-2M12 10a2.5 2.5 0 1 1-2-2M14 8a2.5 2.5 0 1 1-2 2" />
      <path d="M12 10v11M12 17c-2 0-3.5-1-4.5-3M12 19c2 0 3.5-1 4.5-3" />
    </>
  ),

  // Personal & lessons
  "mobile-hair-beauty": (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
    </>
  ),
  tutors: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2Z" />
      <path d="M4 20a2 2 0 0 0 2 1h14M8 7h8" />
    </>
  ),
  "driving-instructors": (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2" />
      <path d="M3.5 10H10M14 10h6.5M12 14v7" />
    </>
  ),
  fitness: <path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" />,
  "music-lessons": (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </>
  ),
  "dog-walking-grooming": (
    <>
      <circle cx="6.5" cy="10" r="1.8" />
      <circle cx="10" cy="5.5" r="1.8" />
      <circle cx="15" cy="5.5" r="1.8" />
      <circle cx="18.5" cy="10" r="1.8" />
      <path d="M12.5 12c-3 0-5.5 3.5-5.5 6 0 2 2 2.5 3 2s1.8-.5 2.5-.5 1.5 0 2.5.5 3 0 3-2c0-2.5-2.5-6-5.5-6Z" />
    </>
  ),

  // Vehicles
  mechanic: (
    <>
      <path d="M5 17H3v-5l2-5h14l2 5v5h-2M7 17h10" />
      <circle cx="7.5" cy="17" r="2" />
      <circle cx="16.5" cy="17" r="2" />
    </>
  ),
  valeting: (
    <>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
      <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
    </>
  ),
  mot: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 13l2 2 4-4" />
    </>
  ),
  "mobile-tyre-fitting": (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
    </>
  ),
};

// Generic fallback: a shield with a tick ("vouched for").
const FALLBACK = (
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </>
);

export const CATEGORY_ICON_SLUGS = Object.keys(ICONS);

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      data-icon={slug in ICONS ? slug : "generic"}
    >
      {ICONS[slug] ?? FALLBACK}
    </svg>
  );
}
