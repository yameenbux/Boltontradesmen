"use client";

import { useState } from "react";
import type { PublicProvider } from "@/lib/directory";
import { BL_DISTRICTS } from "@/lib/districts";
import { ProviderList } from "@/components/category/ProviderList";

/**
 * Area chips plus the ranked and newcomer lists. Filters client-side so the category page stays static
 * (no searchParams) and cacheable.
 */
export function AreaFilter({ ranked, newcomers }: { ranked: PublicProvider[]; newcomers: PublicProvider[] }) {
  const [area, setArea] = useState("");
  const keep = (p: PublicProvider) => !area || p.areas.includes(area);
  const r = ranked.filter(keep);
  const n = newcomers.filter(keep);

  return (
    <>
      <div className="areas" role="group" aria-label="Your area">
        {["", ...BL_DISTRICTS].map((a) => (
          <button key={a || "all"} type="button" className="chip press" aria-pressed={area === a} onClick={() => setArea(a)}>
            {a || "All of Bolton"}
          </button>
        ))}
      </div>

      {/* Keyed by area so the cards rise again when the filter changes. */}
      {r.length > 0 && <ProviderList key={`r-${area}`} providers={r} testId="ranked-list" />}

      <div aria-live="polite">
        {r.length === 0 && n.length === 0 && (
          <p className="empty list">Nobody listed for {area} yet. Try “All of Bolton”.</p>
        )}
      </div>

      {n.length > 0 && (
        <section aria-labelledby="new-title">
          <div className="subhead">
            <h2 id="new-title">New on Bolton Vouched</h2>
            <span className="tag">Under 3 reviews</span>
          </div>
          <p className="muted">Not enough reviews for a score yet. Used one of them? Leave a review on their page.</p>
          <ProviderList key={`n-${area}`} providers={n} testId="newcomers-list" />
        </section>
      )}
    </>
  );
}
