import Link from "next/link";
import type { PublicProvider } from "@/lib/directory";
import { NeedsReviews } from "@/components/StatsBlock";

export function ProviderCard({ provider: p }: { provider: PublicProvider }) {
  return (
    <li>
      <Link
        href={`/p/${p.slug}`}
        className="block min-h-12 rounded-lg border border-neutral-300 p-4 hover:border-neutral-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-lg font-bold">{p.businessName}</p>
            {p.isVerified && <p className="text-sm font-semibold text-emerald-900">✓ Verified</p>}
            {p.areas.length > 0 && <p className="text-sm text-neutral-700">{p.areas.join(", ")}</p>}
          </div>
          {p.score !== null && p.useAgainPct !== null ? (
            <div className="shrink-0 text-right">
              <p className="text-3xl font-extrabold leading-none text-emerald-900">{p.useAgainPct}%</p>
              <p className="text-sm font-semibold">Would use again</p>
              <p className="text-xs text-neutral-700">{p.reviewCount} reviews</p>
            </div>
          ) : (
            <div className="shrink-0 text-right text-sm">
              <NeedsReviews reviewCount={p.reviewCount} />
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
