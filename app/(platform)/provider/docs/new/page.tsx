import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DocEditor, type DocDraft } from "@/components/docs/DocEditor";
import type { JobRequestRow } from "@/components/provider/JobRequests";
import { Button } from "@/components/ui/Button";
import { nationalNumber, clip } from "@/lib/alert-text";
import { londonDatePlus, myDocListing } from "@/lib/my-docs";
import { platformPath } from "@/lib/paths";
import type { DocKind } from "@/lib/trade-docs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New quote or invoice | Bolton Vouched", robots: { index: false } };

const ID = /^[0-9a-f-]{36}$/i;

export default async function NewDocPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; request?: string; listing?: string }>;
}) {
  const sp = await searchParams;
  const kind: DocKind = sp.kind === "invoice" ? "invoice" : "quote";
  const here = `${platformPath("provider", "docs", "new")}?kind=${kind}${sp.request && ID.test(sp.request) ? `&request=${sp.request}` : ""}`;
  const { supabase, listing, isPro } = await myDocListing(here, sp.listing);

  const draft: DocDraft = {
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    title: "",
    lines: [],
    notes: "",
    until: londonDatePlus(kind === "quote" ? 30 : 14),
    ask_review: true,
    job_request_id: null,
  };
  // From a job request: its name, number, email and the job, so the trader only adds the prices.
  if (isPro && sp.request && ID.test(sp.request)) {
    const { data } = await supabase.rpc("my_job_requests", { p_provider: listing.id });
    const r = ((data ?? []) as JobRequestRow[]).find((j) => j.id === sp.request);
    if (r) {
      draft.customer_name = r.name;
      draft.customer_phone = nationalNumber(r.phone);
      draft.customer_email = r.email ?? "";
      draft.title = clip(r.body, 60);
      draft.job_request_id = r.id;
    }
  }

  return (
    <main className="auth">
      <Breadcrumbs
        plain
        trail={[
          { name: "Your listing", path: platformPath("provider") },
          { name: kind === "quote" ? "New quote" : "New invoice", path: here },
        ]}
      />
      <section className="auth-card" aria-labelledby="doc-title">
        <div>
          <p className="eyebrow">{listing.businessName}</p>
          <h1 id="doc-title">{kind === "quote" ? "New quote" : "New invoice"}</h1>
          <p className="lede">
            {kind === "quote"
              ? "Save it, then send it on WhatsApp or by email. Your customer accepts it online."
              : "Save it, then send it on WhatsApp or by email. It shows your bank details for payment."}
          </p>
        </div>
        {isPro ? (
          <DocEditor providerId={listing.id} kind={kind} draft={draft} />
        ) : (
          <>
            <p className="form-alert">Quotes and invoices come with Pro.</p>
            <Button href={platformPath("provider")} variant="secondary">
              Back to your listing
            </Button>
          </>
        )}
      </section>
    </main>
  );
}
