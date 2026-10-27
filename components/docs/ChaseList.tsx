import { chaseWhatsApp, type Chase } from "@/lib/insights";
import { docNumber, money, publicDocPath } from "@/lib/trade-docs";
import { absoluteUrl } from "@/lib/seo";
import { plural } from "@/lib/enquiries";

/**
 * Quotes sent 3 or more days ago that the customer hasn't answered: one tap opens WhatsApp with a short, friendly
 * chase message (the trader can edit it before sending). `emailsOn`: the daily job also emails a reminder to
 * customers with an email address.
 */
export function ChaseList({ chases, business, emailsOn }: { chases: Chase[]; business: string; emailsOn: boolean }) {
  if (chases.length === 0) return null;
  return (
    <div className="chase" data-testid="chase-list">
      <h3>Waiting on an answer</h3>
      <p className="avail-hint">
        A quick nudge wins work you&apos;ve already priced.
        {emailsOn && " Customers with an email get a friendly reminder from us after 3 days and again after 7."}
      </p>
      <ul>
        {chases.map(({ doc, days }) => {
          const wa = chaseWhatsApp(doc, business, absoluteUrl(publicDocPath(doc.token)));
          return (
            <li key={doc.id}>
              <span>
                <b>
                  {docNumber(doc.kind, doc.number)} · {doc.customer_name}
                </b>
                <small>
                  {doc.title} · {money(doc.total_pence)} · sent {plural(days, "day", "days")} ago
                </small>
              </span>
              {wa && (
                <a className="btn btn-secondary chase-btn" href={wa} target="_blank" rel="noopener noreferrer">
                  Chase on WhatsApp
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
