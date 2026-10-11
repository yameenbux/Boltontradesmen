import type { PublicProvider } from "@/lib/directory";

type Stats = Pick<
  PublicProvider,
  "reviewCount" | "score" | "useAgainPct" | "onTimePct" | "onPricePct" | "tidyPct"
>;

export function NeedsReviews({ reviewCount }: { reviewCount: number }) {
  return (
    <div>
      <p className="font-semibold text-neutral-900">3 reviews needed for a score</p>
      <p className="text-sm text-neutral-700">
        {reviewCount === 0 ? "No reviews yet" : `${reviewCount} review${reviewCount === 1 ? "" : "s"} so far`}
      </p>
    </div>
  );
}

function Row({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-neutral-200 py-2">
      <span>{label}</span>
      <span className="font-bold">{pct}%</span>
    </div>
  );
}

export function StatsBlock({ stats }: { stats: Stats }) {
  if (stats.score === null || stats.useAgainPct === null) {
    return (
      <section aria-label="Reviews" className="rounded-lg bg-neutral-100 p-4">
        <NeedsReviews reviewCount={stats.reviewCount} />
      </section>
    );
  }
  return (
    <section aria-label="Reviews" className="rounded-lg bg-neutral-100 p-4">
      <p className="text-5xl font-extrabold leading-none text-emerald-900">{stats.useAgainPct}%</p>
      <p className="mt-1 text-lg font-semibold">Would use again</p>
      <p className="mb-3 text-sm text-neutral-700">
        From {stats.reviewCount} review{stats.reviewCount === 1 ? "" : "s"} by Bolton residents
      </p>
      {stats.onTimePct !== null && <Row label="Turned up on time" pct={stats.onTimePct} />}
      {stats.onPricePct !== null && <Row label="Price as quoted" pct={stats.onPricePct} />}
      {stats.tidyPct !== null && <Row label="Left things tidy" pct={stats.tidyPct} />}
    </section>
  );
}
