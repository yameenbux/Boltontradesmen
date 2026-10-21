"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { emailDoc, makeInvoice, markDoc } from "@/app/(platform)/provider/docs/actions";
import { platformPath } from "@/lib/paths";
import { docNumber, money, type TradeDoc } from "@/lib/trade-docs";

/** The message that goes with the link on WhatsApp, from the trader's own phone. */
function waText(doc: TradeDoc, business: string, link: string): string {
  const what = doc.kind === "quote" ? "your quote" : "your invoice";
  return `Hi ${doc.customer_name}, here's ${what} from ${business} (${docNumber(doc.kind, doc.number)}, ${money(doc.total_pence)}): ${link}`;
}

/**
 * What the trader can do with a quote or invoice: send it (WhatsApp from their own phone, email, or copy the link),
 * turn an accepted quote into an invoice, and mark an invoice paid (which asks for a review) or cancel it.
 */
export function DocActions({ doc, business, link, canWrite }: { doc: TradeDoc; business: string; link: string; canWrite: boolean }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const mobile = doc.customer_phone && /^\+447/.test(doc.customer_phone) ? doc.customer_phone.replace(/^\+/, "") : null;
  const wa = `https://wa.me/${mobile ?? ""}?text=${encodeURIComponent(waText(doc, business, link))}`;
  const open = doc.status !== "void";

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, okText: string) =>
    start(async () => {
      const r = await fn();
      setNote({ ok: r.ok, text: r.message ?? (r.ok ? okText : "That didn't work. Please try again.") });
    });

  return (
    <div className="doc-actions">
      {open && doc.status !== "paid" && (
        <>
          <Button
            href={wa}
            target="_blank"
            rel="noopener"
            onClick={() => {
              if (doc.kind === "quote" && doc.status === "draft") start(async () => void (await markDoc(doc.id, "sent")));
              if (doc.kind === "invoice" && !doc.sent_at) start(async () => void (await markDoc(doc.id, "invoice_sent")));
            }}
          >
            Send on WhatsApp
          </Button>
          {doc.customer_email && (
            <Button variant="secondary" disabled={pending} onClick={() => run(() => emailDoc(doc.id), "Emailed.")}>
              Email it to {doc.customer_email}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setNote({ ok: true, text: "Link copied." });
              } catch {
                setNote({ ok: false, text: link });
              }
            }}
          >
            Copy the link
          </Button>
        </>
      )}
      {canWrite && doc.kind === "quote" && doc.status === "accepted" && !doc.invoice_id && (
        <Button disabled={pending} onClick={() => run(() => makeInvoice(doc.id) as Promise<{ ok: boolean; message?: string }>, "")}>
          Turn into an invoice
        </Button>
      )}
      {doc.invoice_id && (
        <Button href={platformPath("provider", "docs", doc.invoice_id)} variant="secondary">
          See the invoice
        </Button>
      )}
      {doc.kind === "invoice" && doc.status === "unpaid" && (
        <Button disabled={pending} onClick={() => run(() => markDoc(doc.id, "paid"), doc.ask_review ? "Marked paid. We've asked them for a review." : "Marked paid.")}>
          Mark as paid
        </Button>
      )}
      {doc.kind === "invoice" && doc.status === "paid" && (
        <Button variant="secondary" disabled={pending} onClick={() => run(() => markDoc(doc.id, "unpaid"), "Marked unpaid.")}>
          Not paid after all
        </Button>
      )}
      {canWrite && ["draft", "sent", "unpaid"].includes(doc.status) && (
        <Button href={platformPath("provider", "docs", doc.id, "edit")} variant="secondary">
          Edit
        </Button>
      )}
      {doc.kind === "invoice" && doc.status === "unpaid" && (
        <button
          type="button"
          className="link doc-void"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Cancel this invoice? Your customer will see it's cancelled.")) run(() => markDoc(doc.id, "void"), "Cancelled.");
          }}
        >
          Cancel this invoice
        </button>
      )}
      {note && (
        <p role={note.ok ? "status" : "alert"} className={note.ok ? "form-ok" : "form-alert"}>
          {note.text}
        </p>
      )}
    </div>
  );
}
