import type { Metadata } from "next";
import { ReviewActions } from "@/components/admin/ModerationForms";
import { ModerationReview, type AdminFlag, type AdminReview } from "@/components/admin/ModerationReview";
import { PendingReviewCard, type PendingReview } from "@/components/admin/PendingReviewCard";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Reviews under check | Admin | Bolton Vouched",
  description: "Live reviews carrying an Under check label, to clear or remove.",
};

type Row = AdminReview & { flags: AdminFlag[] };

export default async function ReviewsQueue() {
  const { supabase } = await requireAdmin();
  const [pendingRes, checkRes] = await Promise.all([
    supabase.rpc("admin_list_reviews_pending"),
    supabase.rpc("admin_list_reviews_under_check"),
  ]);
  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (checkRes.error) throw new Error(checkRes.error.message);
  const pending = (pendingRes.data ?? []) as PendingReview[];
  const rows = (checkRes.data ?? []) as Row[];
  const now = new Date();
  return (
    <main className="flex flex-col gap-8">
      <section className="a-section" aria-labelledby="pending-title">
        <div>
          <h1 id="pending-title" className="a-title">
            Reviews awaiting approval
          </h1>
          <p className="a-lede">
            From people who signed in with an email code. They aren&apos;t shown or counted until you approve them.
            Approve if it reads like a real customer; remove only for cause.
          </p>
        </div>
        {pending.length === 0 ? (
          <p className="empty">Nothing waiting.</p>
        ) : (
          <div className="mod-list">
            {pending.map((r) => (
              <PendingReviewCard key={r.id} review={r} now={now} />
            ))}
          </div>
        )}
      </section>

      <section className="a-section" aria-labelledby="check-title">
        <div>
          <h2 id="check-title">Reviews under check</h2>
          <p className="a-lede">
            These are live with an &ldquo;Under check&rdquo; label and still count. Clear the check if it looks
            genuine; remove only for cause.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="empty">Nothing under check. All clear.</p>
        ) : (
          <div className="mod-list">
            {rows.map((r) => (
              <article
                key={r.id}
                className="a-card mod-card"
                aria-label={`Review of ${r.business_name} by ${r.reviewer_name}`}
              >
                <ModerationReview review={r} flags={r.flags} ageNow={now} />
                <ReviewActions reviewId={r.id} underCheck />
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
