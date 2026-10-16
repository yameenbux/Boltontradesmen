"use client";

import { useState } from "react";
import type { PublicProvider } from "@/lib/directory";
import { BL_DISTRICTS } from "@/lib/districts";
import { ProviderList } from "@/components/category/ProviderList";

/**
 * Area chips, a "Taking on work" chip, and the ranked and newcomer lists. Filters client-side so the category page
 * stays static (no searchParams) and cacheable. Both only hide cards: the order is the server's, unchanged.
 */
export function AreaFilter({ ranked, newcomers }: { ranked: PublicProvider[]; newcomers: PublicProvider[] }) {
  const [area, setArea] = useState("");
  const [taking, setTaking] = useState(false);
  // Only offered when someone in the list is taking on work, so it never leads to an empty page on its own.
  const anyTaking = [...ranked, ...newcomers].some((p) => p.availability?.status === "taking");
  const onlyTaking = taking && anyTaking;
  const keep = (p: PublicProvider) =>
    (!area || p.areas.includes(area)) && (!onlyTaking || p.availability?.status === "taking");
  const r = ranked.filter(keep);
  const n = newcomers.filter(keep);
  const key = `${area}-${onlyTaking ? "t" : "a"}`;

  return (
    <>
      <div className="areas" role="group" aria-label="Your area">
        {["", ...BL_DISTRICTS].map((a) => (
          <button key={a || "all"} type="button" className="chip press" aria-pressed={area === a} onClick={() => setArea(a)}>
            {a || "All of Bolton"}
          </button>
        ))}
      </div>
      {anyTaking && (
        <div className="avail-filter">
          <button type="button" className="chip press chip-taking" aria-pressed={onlyTaking} onClick={() => setTaking(!taking)}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="12" r="6" />
            </svg>
            Taking on work
          </button>
        </div>
      )}

      {/* Keyed by the filters so the cards rise again when they change. */}
      {r.length > 0 && <ProviderList key={`r-${key}`} providers={r} testId="ranked-list" />}

      <div aria-live="polite">
        {r.length === 0 && n.length === 0 && (
          <p className="empty list">
            {onlyTaking
              ? `Nobody${area ? ` in ${area}` : ""} has said they're taking on work right now. Tap “Taking on work” again to see everyone.`
              : `Nobody listed for ${area} yet. Try “All of Bolton”.`}
          </p>
        )}
      </div>

      {n.length > 0 && (
        <section aria-labelledby="new-title">
          <div className="subhead">
            <h2 id="new-title">New on Bolton Vouched</h2>
            <span className="tag">Under 3 reviews</span>
          </div>
          <p className="muted">Not enough reviews for a score yet. Used one of them? Leave a review on their page.</p>
          <ProviderList key={`n-${key}`} providers={n} testId="newcomers-list" />
        </section>
      )}
    </>
  );
}
