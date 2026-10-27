import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerDocActions } from "@/components/docs/CustomerDocActions";
import { DocSheet } from "@/components/docs/DocSheet";
import { PayByCard } from "@/components/docs/PayByCard";
import { Button } from "@/components/ui/Button";
import { nationalNumber } from "@/lib/alert-text";
import { platformPath } from "@/lib/paths";
import { after } from "next/server";
import { cardPaymentFor, confirmReturn } from "@/lib/card-payments";
import { payLink } from "@/lib/pay-link";
import { deliverCustomerMessage } from "@/lib/notify";
import { stripeConfig } from "@/lib/pro";
import { createServiceClient } from "@/lib/supabase/service";
import { docNumber, leftToPay, money, sortCode, type Billing, type TradeDoc } from "@/lib/trade-docs";

// The customer's copy of a quote or invoice. The random token in the link is the only key (no sign-in), so: per
// request, never indexed, never cached, and no customer contact details on it.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quote or invoice | Bolton Vouched", robots: { index: false, follow: false } };

type PublicDoc = {
  doc: TradeDoc;
  business_name: string;
  slug: string | null;
  phone: string;
  bank: Billing | null;
  pay_link?: string | null;
};

export default async function CustomerDocPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ card?: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const cfg = stripeConfig();
  // Back from Stripe's checkout: record the payment now, in case Stripe's webhook hasn't yet.
  const { card } = await searchParams;
  const confirmed = cfg && card ? await confirmReturn(cfg, token, card) : null;
  const { data, error } = await createServiceClient().rpc("public_doc", { p_token: token });
  if (error) throw new Error(`public_doc failed: ${error.message}`);
  if (!data) notFound();
  const { doc, business_name, slug, phone, bank, pay_link } = data as PublicDoc;
  const label = docNumber(doc.kind, doc.number);
  // A paid invoice asks the customer for an honest review, as when the trader marks it paid.
  if (confirmed?.result === "recorded" && confirmed.ask_review) after(() => deliverCustomerMessage("review_request", doc.id));
  // What they can pay by card now (with Pro and the trader's Stripe account ready), if anything.
  const pay = cfg ? await cardPaymentFor(token).catch(() => null) : null;
  // The trader's own provider (SumUp, PayPal...), when they haven't connected Stripe. Checked again here.
  const ownLink = !pay && pay_link ? payLink(pay_link) : null;
  const paidByCard = !!card && ((doc.kind === "invoice" && doc.paid_by_card) || (doc.kind === "quote" && !!doc.deposit_paid_at));

  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="cdoc-title">
        <h1 id="cdoc-title" className="sr-only">
          {doc.kind === "quote" ? "Quote" : "Invoice"} {label} from {business_name}
        </h1>
        <DocSheet doc={doc} business={business_name} />
        {doc.kind === "quote" && doc.status === "sent" && <CustomerDocActions token={token} />}
        {paidByCard && (
          <p className="form-ok" role="status" data-testid="card-paid">
            Paid by card. Thank you: {business_name} can see it in their Stripe account.
          </p>
        )}
        {doc.kind === "quote" && (doc.status === "accepted" || doc.status === "declined") && !paidByCard && (
          <p className="form-ok" role="status">
            You {doc.status} this quote. {business_name} has been told.
          </p>
        )}
        {pay?.what === "deposit" && (
          <section className="pay-box" aria-labelledby="deposit-title">
            <h2 id="deposit-title">Pay your deposit</h2>
            <p>
              {business_name} asks for a {money(pay.amount_pence)} deposit to book the job. The rest comes on the
              invoice.
            </p>
            <PayByCard token={token} label={`Pay ${money(pay.amount_pence)} deposit by card`} />
          </section>
        )}
        {doc.kind === "invoice" && doc.status === "unpaid" && (
          <section className="pay-box" aria-labelledby="pay-title">
            <h2 id="pay-title">How to pay</h2>
            {pay?.what === "invoice" && <PayByCard token={token} label={`Pay ${money(pay.amount_pence)} by card`} />}
            {ownLink && (
              <div className="pay-card">
                <a className="btn btn-primary" href={ownLink.url} target="_blank" rel="noopener noreferrer nofollow">
                  Pay {money(leftToPay(doc))} by card
                </a>
                <p className="hint">
                  Through {ownLink.name}, {business_name}&apos;s card payments. Use {label} as the reference.
                </p>
              </div>
            )}
            {(pay?.what === "invoice" || ownLink) && bank && <p className="pay-or">Or by bank transfer:</p>}
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
            {bank && (
              <p className="hint">
                Pay {money(leftToPay(doc))} by bank transfer, using the reference. {business_name} marks it paid once it
                arrives.
              </p>
            )}
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
