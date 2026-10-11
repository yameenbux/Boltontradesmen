import { checksSummaryText, type Check } from "@/lib/checks";

export function ChecksRow({ checks }: { checks: Check[] }) {
  return (
    <section aria-label="Checks" className="rounded-lg border border-neutral-300 p-4">
      <h2 className="text-base font-bold">Checks</h2>
      <p className="mt-1 text-base text-neutral-800">{checksSummaryText(checks)}</p>
    </section>
  );
}
