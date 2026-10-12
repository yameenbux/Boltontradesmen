import { ReviewActions } from "@/components/admin/ModerationForms";
import { ModerationReview, type AdminFlag, type AdminReview } from "@/components/admin/ModerationReview";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

type Row = AdminReview & { flags: AdminFlag[] };

export default async function ReviewsUnderCheck() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_list_reviews_under_check");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const now = new Date();
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="a-title">Reviews under check</h1>
        <p className="a-lede">
          These are live with an &ldquo;Under check&rdquo; label and still count. Clear the check if it looks genuine;
          remove only for cause.
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
    </main>
  );
}
