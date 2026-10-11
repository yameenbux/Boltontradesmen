"use client";

import { useState } from "react";
import { BL_DISTRICTS } from "@/lib/districts";
import type { PublicProvider } from "@/lib/directory";
import { ProviderCard } from "@/components/ProviderCard";

// Filters client-side so the category page itself stays cacheable (no searchParams).
export function DistrictFilter({
  ranked,
  newcomers,
}: {
  ranked: PublicProvider[];
  newcomers: PublicProvider[];
}) {
  const [district, setDistrict] = useState("");
  const keep = (p: PublicProvider) => !district || p.areas.includes(district);
  const r = ranked.filter(keep);
  const n = newcomers.filter(keep);

  return (
    <>
      <div className="my-4">
        <label htmlFor="district" className="block text-base font-semibold">
          Your area
        </label>
        <select
          id="district"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          className="mt-1 min-h-12 w-full rounded-lg border-2 border-neutral-400 bg-white px-3 text-base text-neutral-900"
        >
          <option value="">All of Bolton</option>
          {BL_DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {r.length > 0 && (
        <ul data-testid="ranked-list" className="flex flex-col gap-3">
          {r.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </ul>
      )}

      {n.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-xl font-bold">New on Bolton Vouched</h2>
          <ul data-testid="newcomers-list" className="flex flex-col gap-3">
            {n.map((p) => (
              <ProviderCard key={p.id} provider={p} />
            ))}
          </ul>
        </>
      )}

      {r.length === 0 && n.length === 0 && (
        <p className="rounded-lg bg-neutral-100 p-4">
          {district ? `Nobody listed here covers ${district} yet.` : "Nobody is listed here yet."}
        </p>
      )}
    </>
  );
}
