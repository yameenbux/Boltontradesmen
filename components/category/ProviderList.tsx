import type { PublicProvider } from "@/lib/directory";
import { ProviderCard } from "@/components/ProviderCard";

/** A staggered list of provider cards. Re-key it to replay the rise animation (e.g. on area change). */
export function ProviderList({ providers, testId }: { providers: PublicProvider[]; testId: string }) {
  return (
    <ul className="list stagger" data-testid={testId}>
      {providers.map((p) => (
        <li key={p.id}>
          <ProviderCard provider={p} />
        </li>
      ))}
    </ul>
  );
}
