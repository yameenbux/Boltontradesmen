import { dayMonthYear } from "@/lib/checks";
import { docNumber, KIND_TEXT, lineTotal, money, STATUS_TEXT, type TradeDoc } from "@/lib/trade-docs";

/** The quote or invoice itself: who it's from and for, the lines, the total, dates and notes. Print-friendly. */
export function DocSheet({ doc, business }: { doc: Pick<TradeDoc, "kind" | "number" | "status" | "customer_name" | "title" | "lines" | "total_pence" | "notes" | "until" | "created_at" | "paid_at">; business: string }) {
  const label = docNumber(doc.kind, doc.number);
  return (
    <article className="doc-sheet" aria-label={`${KIND_TEXT[doc.kind]} ${label}`}>
      <header className="doc-head">
        <div>
          <p className="eyebrow">
            {KIND_TEXT[doc.kind]} {label}
          </p>
          <h2 className="doc-business">{business}</h2>
          <p className="doc-for">
            For <b>{doc.customer_name}</b> · {dayMonthYear(doc.created_at)}
          </p>
        </div>
        <span className={`doc-status s-${doc.status}`} data-testid="doc-status">
          {STATUS_TEXT[doc.status]}
        </span>
      </header>
      <p className="doc-title">{doc.title}</p>
      <table className="doc-table">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Qty</th>
            <th scope="col">Price</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td>{l.quantity}</td>
              <td>{money(l.unit_pence)}</td>
              <td>{money(lineTotal(l))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Total
            </th>
            <td data-testid="doc-total">{money(doc.total_pence)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="doc-meta">
        {doc.kind === "quote" && doc.until && <>Valid until {dayMonthYear(doc.until)}. </>}
        {doc.kind === "invoice" && doc.status === "unpaid" && doc.until && <>Due by {dayMonthYear(doc.until)}. </>}
        {doc.kind === "invoice" && doc.status === "paid" && doc.paid_at && <>Paid {dayMonthYear(doc.paid_at)}. Thank you. </>}
        No VAT added.
      </p>
      {doc.notes && <p className="doc-notes">{doc.notes}</p>}
    </article>
  );
}
