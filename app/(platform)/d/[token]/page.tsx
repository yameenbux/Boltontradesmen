import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerDocActions } from "@/components/docs/CustomerDocActions";
import { DocSheet } from "@/components/docs/DocSheet";
import { Button } from "@/components/ui/Button";
import { nationalNumber } from "@/lib/alert-text";
import { platformPath } from "@/lib/paths";
import { createServiceClient } from "@/lib/supabase/service";
import { docNumber, sortCode, type Billing, type TradeDoc } from "@/lib/trade-docs";

// The customer's copy of a quote or invoice. The random token in the link is the only key (no sign-in), so: per
// request, never indexed, never cached, and no customer contact details on it.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quote or invoice | Bolton Vouched", robots: { index: false, follow: false } };

type PublicDoc = { doc: TradeDoc; business_name: string; slug: string | null; phone: string; bank: Billing | null };

export default async function CustomerDocPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const { data, error } = await createServiceClient().rpc("public_doc", { p_token: token });
  if (error) throw new Error(`public_doc failed: ${error.message}`);
  if (!data) notFound();
  const { doc, business_name, slug, phone, bank } = data as PublicDoc;
  const label = docNumber(doc.kind, doc.number);

  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="cdoc-title">
        <h1 id="cdoc-title" className="sr-only">
          {doc.kind === "quote" ? "Quote" : "Invoice"} {label} from {business_name}
        </h1>
        <DocSheet doc={doc} business={business_name} />
        {doc.kind === "quote" && doc.status === "sent" && <CustomerDocActions token={token} />}
        {doc.kind === "quote" && (doc.status === "accepted" || doc.status === "declined") && (
          <p className="form-ok" role="status">
            You {doc.status} this quote. {business_name} has been told.
          </p>
        )}
        {doc.kind === "invoice" && doc.status === "unpaid" && (
          <section className="pay-box" aria-labelledby="pay-title">
            <h2 id="pay-title">How to pay</h2>
            {bank ? (
              <dl className="pay-details">
                <div>
                  <dt>Account name</dt>
                  <dd>{bank.account_name}</dd>
                </div>
                <div>
                  <dt>Sort code</dt>
                  <dd>{sortCode(bank.sort_code)}</dd>
                </div>
                <div>
                  <dt>Account number</dt>
                  <dd>{bank.account_number}</dd>
                </div>
                <div>
                  <dt>Reference</dt>
                  <dd>{label}</dd>
                </div>
              </dl>
            ) : (
              <p>Ask {business_name} how they&apos;d like to be paid.</p>
            )}
            <p className="hint">Pay by bank transfer, using the reference. {business_name} marks it paid once it arrives.</p>
          </section>
        )}
        {doc.kind === "invoice" && doc.status === "void" && <p className="form-alert">This invoice has been cancelled.</p>}
        <div className="doc-from">
          <Button href={`tel:${phone}`} variant="secondary">
            Call {business_name} on {nationalNumber(phone)}
          </Button>
          {slug && (
            <a className="link" href={platformPath("p", slug)}>
              See {business_name} on Bolton Vouched
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
