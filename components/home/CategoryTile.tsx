import Link from "next/link";
import { CategoryIcon } from "@/components/CategoryIcon";
import { platformPath } from "@/lib/paths";

export const localPros = (n: number) => `${n} local pro${n === 1 ? "" : "s"}`;

// The home page's shortcut grid: an icon over each trade's name, then a dark "All trades" tile with the total.
export function Shortcuts({ trades, total }: { trades: { slug: string; name: string }[]; total: number }) {
  return (
    <ul className="shortcuts stagger" data-testid="shortcuts">
      {trades.map((c) => (
        <li key={c.slug}>
          <Link href={platformPath("c", c.slug)} className="shortcut press">
            <span className="ic" aria-hidden="true">
              <CategoryIcon slug={c.slug} />
            </span>
            <span className="nm">{c.name}</span>
          </Link>
        </li>
      ))}
      <li>
        <Link href={platformPath("trades")} className="shortcut all press">
          <span className="ic" aria-hidden="true">
            {total}
          </span>
          <span className="nm">All trades</span>
        </Link>
      </li>
    </ul>
  );
}
