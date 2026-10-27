import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DocEditor } from "@/components/docs/DocEditor";
import { nationalNumber } from "@/lib/alert-text";
import { myDoc } from "@/lib/my-docs";
import { platformPath } from "@/lib/paths";
import { docNumber } from "@/lib/trade-docs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit | Bolton Vouched", robots: { index: false } };

export default async function EditDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { doc, provider_id, business_name, isPro } = await myDoc(id);
  const view = platformPath("provider", "docs", id);
  if (!isPro || !["draft", "sent", "unpaid"].includes(doc.status)) redirect(view);
  const label = docNumber(doc.kind, doc.number);
  return (
    <main className="auth">
      <Breadcrumbs
        plain
        trail={[
          { name: "Your listing", path: platformPath("provider") },
          { name: label, path: view },
          { name: "Edit", path: platformPath("provider", "docs", id, "edit") },
        ]}
      />
      <section className="auth-card" aria-labelledby="doc-title">
        <div>
          <p className="eyebrow">{business_name}</p>
          <h1 id="doc-title">Edit {label}</h1>
          {doc.status === "sent" && <p className="lede">Your customer sees the changes on the same link.</p>}
        </div>
        <DocEditor
          providerId={provider_id}
          kind={doc.kind}
          draft={{
            id: doc.id,
            customer_name: doc.customer_name,
            customer_phone: doc.customer_phone ? nationalNumber(doc.customer_phone) : "",
            customer_email: doc.customer_email ?? "",
            title: doc.title,
            lines: doc.lines,
            notes: doc.notes ?? "",
            until: doc.until ?? "",
            deposit: doc.deposit_pence ? (doc.deposit_pence / 100).toFixed(2) : "",
            ask_review: doc.ask_review,
            job_request_id: doc.job_request_id,
          }}
        />
      </section>
    </main>
  );
}
