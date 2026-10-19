import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DocActions } from "@/components/docs/DocActions";
import { DocSheet } from "@/components/docs/DocSheet";
import { nationalNumber } from "@/lib/alert-text";
import { dayMonthYear } from "@/lib/checks";
import { myDoc } from "@/lib/my-docs";
import { platformPath } from "@/lib/paths";
import { absoluteUrl } from "@/lib/seo";
import { docNumber, publicDocPath } from "@/lib/trade-docs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quote or invoice | Bolton Vouched", robots: { index: false } };

const NEXT_STEP: Record<string, string> = {
  draft: "Not sent yet. Send it on WhatsApp or by email: your customer can accept it online.",
  sent: "Sent. We'll text you when your customer accepts or declines it.",
  accepted: "Accepted. When the job's done, turn it into an invoice in one tap.",
  declined: "Your customer declined this quote.",
  unpaid: "Waiting for payment. We remind your customer 3 and 10 days after the due date.",
  paid: "Paid.",
  void: "Cancelled.",
};

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { doc, business_name, isPro } = await myDoc(id);
  const label = docNumber(doc.kind, doc.number);
  const link = absoluteUrl(publicDocPath(doc.token));
  return (
    <main className="auth">
      <Breadcrumbs
        plain
        trail={[
          { name: "Your listing", path: platformPath("provider") },
          { name: label, path: platformPath("provider", "docs", id) },
        ]}
      />
      <section className="auth-card" aria-labelledby="doc-page-title">
        <div>
          <p className="eyebrow">{doc.kind === "quote" ? "Quote" : "Invoice"}</p>
          <h1 id="doc-page-title">{label}</h1>
          <p className="lede" data-testid="doc-next">
            {NEXT_STEP[doc.status]}
            {doc.status === "paid" && doc.ask_review && " We've asked your customer for an honest review."}
          </p>
          <p className="doc-contact">
            {doc.customer_phone && <>{nationalNumber(doc.customer_phone)} · </>}
            {doc.customer_email ?? ""}
            {doc.sent_at && <> · sent {dayMonthYear(doc.sent_at)}</>}
          </p>
        </div>
        <DocSheet doc={doc} business={business_name} />
        <DocActions doc={doc} business={business_name} link={link} canWrite={isPro} />
      </section>
    </main>
  );
}
