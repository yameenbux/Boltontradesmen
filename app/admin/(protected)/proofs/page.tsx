import { ProofActions } from "@/components/admin/ModerationForms";
import { ModerationReview, type AdminReview } from "@/components/admin/ModerationReview";
import { requireAdmin } from "@/lib/admin";
import { dayMonthYear } from "@/lib/checks";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type Row = { id: string; mime_type: string; created_at: string; review: AdminReview };

/** A 60-second link to the private file, or null when Storage can't give one. */
async function signedUrl(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], proofId: string) {
  const { data: path, error } = await supabase.rpc("admin_proof_path", { p_proof: proofId });
  if (error || typeof path !== "string") return null;
  try {
    const { data } = await createServiceClient().storage.from("review-proofs").createSignedUrl(path, 60);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export default async function Proofs() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_list_pending_proofs");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const urls = await Promise.all(rows.map((r) => signedUrl(supabase, r.id)));
  const now = new Date();
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="a-title">Proofs to check</h1>
        <p className="a-lede">
          Does it show this job, by this provider? Accept and the review shows &ldquo;Verified job&rdquo;. Only you see
          these files; links last a minute.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="empty">No proofs waiting.</p>
      ) : (
        <div className="mod-list">
          {rows.map((p, i) => {
            const url = urls[i];
            const pdf = p.mime_type === "application/pdf";
            return (
              <article key={p.id} className="a-card mod-card" aria-label={`Proof for ${p.review.business_name}`}>
                <div className="mod-proof">
                  {!url ? (
                    <p className="mod-proof-missing">
                      The file couldn&apos;t be loaded just now. Refresh to try again.
                    </p>
                  ) : pdf ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="btn press btn-secondary">
                      Open PDF
                    </a>
                  ) : (
                    // A signed, short-lived URL to a private file: next/image would cache it, so a plain img.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={`Proof sent with the review of ${p.review.business_name}`} />
                  )}
                  <small>
                    {pdf ? "PDF" : "Photo"} sent {dayMonthYear(p.created_at)}
                  </small>
                </div>
                <ModerationReview review={p.review} ageNow={now} />
                <ProofActions proofId={p.id} />
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
