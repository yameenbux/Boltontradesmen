import Link from "next/link";
import { platformPath } from "@/lib/paths";
import { docNumber, money, STATUS_TEXT, type TradeDoc } from "@/lib/trade-docs";

/** The trader's recent quotes and invoices, newest first. */
export function DocList({ docs }: { docs: TradeDoc[] }) {
  if (docs.length === 0) return <p className="reviews-empty">No quotes or invoices yet.</p>;
  return (
    <ul className="doc-list" data-testid="doc-list">
      {docs.map((d) => (
        <li key={d.id}>
          <Link href={platformPath("provider", "docs", d.id)} className="doc-row press">
            <span className="doc-row-main">
              <b>{docNumber(d.kind, d.number)}</b> {d.customer_name}
              <span className="doc-row-title">{d.title}</span>
            </span>
            <span className="doc-row-side">
              <b>{money(d.total_pence)}</b>
              <span className={`doc-status s-${d.status}`}>{STATUS_TEXT[d.status]}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
