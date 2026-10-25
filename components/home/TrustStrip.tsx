const icon = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// Three short reasons to trust the list, as pills under the search.
export function TrustStrip() {
  return (
    <ul className="trust" aria-label="Why trust it">
      <li>
        <svg {...icon}>
          <path d="m12 3 2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.3 6.6 19.2l1.2-5.9L3.4 9.2l6-.7L12 3Z" />
        </svg>
        Real local reviews
      </li>
      <li>
        <svg {...icon}>
          <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
        </svg>
        Call direct, no sign-up
      </li>
      <li>
        <svg {...icon}>
          {/* Pound sign (£), matching the consent page's "Free, and fair" icon. */}
          <path d="M16.5 7a4 4 0 0 0-8 1v12" />
          <path d="M5.5 13h8M5.5 20h13" />
        </svg>
        Nobody pays to rank
      </li>
    </ul>
  );
}
