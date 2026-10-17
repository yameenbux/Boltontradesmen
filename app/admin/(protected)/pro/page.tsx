import type { Metadata } from "next";
import Link from "next/link";
import { DeleteDueProFilesForm, ProDocumentDecision } from "@/components/admin/ProForms";
import { Pill } from "@/components/ui/Pill";
import { requireAdmin } from "@/lib/admin";
import { dayMonthYear } from "@/lib/checks";
import { DOCUMENT_LABEL, stripeConfig, type DocumentKind } from "@/lib/pro";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pro | Admin | Bolton Vouched",
  description: "Pro traders, and the ID documents waiting to be checked.",
};

type Pending = {
  id: string;
  kind: DocumentKind;
  mime_type: string;
  created_at: string;
  provider_id: string;
  slug: string;
  business_name: string;
  contact_name: string | null;
  is_pro: boolean;
};
type Trader = {
  provider_id: string;
  slug: string;
  business_name: string;
  listing_status: string;
  is_pro: boolean;
  plan: "monthly" | "annual";
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  id_status: "none" | "pending" | "approved" | "rejected";
  photo_count: number;
};

const ID_TEXT = { none: "No ID sent", pending: "ID waiting", approved: "ID checked", rejected: "ID rejected" } as const;

/** A 60-second link to the private file (every look is audited), or null when Storage can't give one. */
async function signedUrl(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], docId: string) {
  const { data: path, error } = await supabase.rpc("admin_pro_document_path", { p_doc: docId });
  if (error || typeof path !== "string") return null;
  try {
    const { data } = await createServiceClient().storage.from("pro-id").createSignedUrl(path, 60);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export default async function ProAdmin() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_pro_overview");
  if (error) throw new Error(error.message);
  const overview = (data ?? {}) as { traders?: Trader[]; pending?: Pending[] };
  const pending = overview.pending ?? [];
  const traders = overview.traders ?? [];
  const urls = await Promise.all(pending.map((d) => signedUrl(supabase, d.id)));
  const live = traders.filter((t) => t.is_pro).length;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="a-title">Pro</h1>
        <p className="a-lede">
          Traders who pay for Pro, and the documents they&apos;ve sent. Approving a photo ID shows &ldquo;ID
          checked&rdquo; on their page while Pro is on. If you reject a photo ID, refund their payment in full in Stripe
          (Payments → the payment → Refund). Insurance and accreditations: record them under Checks on the
          provider&apos;s page, with the expiry date, then approve here.
        </p>
        {!stripeConfig() && (
          <p className="a-hint mt-2">Stripe isn&apos;t set up yet, so traders see &ldquo;Pro opens soon&rdquo; and nobody can pay.</p>
        )}
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="pending-title">
        <h2 id="pending-title" className="a-sub">
          Documents to check {pending.length > 0 && <em>{pending.length}</em>}
        </h2>
        {pending.length === 0 ? (
          <p className="empty">No documents waiting.</p>
        ) : (
          <div className="mod-list">
            {pending.map((d, i) => {
              const url = urls[i];
              const pdf = d.mime_type === "application/pdf";
              return (
                <article key={d.id} className="a-card mod-card" aria-label={`${DOCUMENT_LABEL[d.kind]} from ${d.business_name}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={d.kind === "photo_id" ? "gold" : "outline"}>{DOCUMENT_LABEL[d.kind]}</Pill>
                    <Link href={`/admin/providers/${d.provider_id}`} className="a-link">
                      {d.business_name}
                    </Link>
                    {d.contact_name && <span className="a-hint">· {d.contact_name}</span>}
                  </div>
                  <div className="mod-proof">
                    {!url ? (
                      <p className="mod-proof-missing">The file couldn&apos;t be loaded just now. Refresh to try again.</p>
                    ) : pdf ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="btn press btn-secondary">
                        Open PDF
                      </a>
                    ) : (
                      // A signed, short-lived URL to a private file: next/image would cache it, so a plain img.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={`${DOCUMENT_LABEL[d.kind]} sent by ${d.business_name}`} />
                    )}
                    <small>
                      Sent {dayMonthYear(d.created_at)}
                      {!d.is_pro && " · Pro is no longer on for this listing"}
                    </small>
                  </div>
                  {d.kind === "photo_id" && (
                    <p className="a-hint">
                      Check the name matches the trader, the photo is clear, and it is in date. Only you see this; the
                      link lasts a minute and each look is logged.
                    </p>
                  )}
                  <ProDocumentDecision docId={d.id} kind={d.kind} />
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="traders-title">
        <h2 id="traders-title" className="a-sub">
          Pro traders <em>{live} on</em>
        </h2>
        {traders.length === 0 ? (
          <p className="empty">Nobody has paid for Pro yet.</p>
        ) : (
          <ul className="a-list" data-testid="pro-traders">
            {traders.map((t) => (
              <li key={t.provider_id}>
                <Link href={`/admin/providers/${t.provider_id}`} className="a-row press">
                  <span className="min-w-0">
                    <b>{t.business_name}</b>
                    <small>
                      {t.plan === "annual" ? "£100 a year" : "£10 a month"} · Stripe: {t.status}
                      {t.cancel_at_period_end ? " (cancels at period end)" : ""}
                      {t.current_period_end ? ` · paid to ${dayMonthYear(t.current_period_end)}` : ""} ·{" "}
                      {ID_TEXT[t.id_status] ?? t.id_status} · {t.photo_count} photo{t.photo_count === 1 ? "" : "s"}
                    </small>
                  </span>
                  <Pill tone={t.is_pro ? "sage" : "muted"}>{t.is_pro ? "Pro on" : "Pro off"}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="a-card" aria-labelledby="old-pro-files-title">
        <h2 id="old-pro-files-title">Old ID documents</h2>
        <p className="a-lede">
          ID and other Pro documents are deleted 30 days after you decide on them, as the privacy notice says. The
          decision stays. There is no automatic run yet, so press this now and then.
        </p>
        <DeleteDueProFilesForm />
      </section>
    </main>
  );
}
