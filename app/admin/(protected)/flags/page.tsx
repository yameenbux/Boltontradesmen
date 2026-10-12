import { FlagActions, RemoveReplyForm, ReviewActions } from "@/components/admin/ModerationForms";
import { ModerationReview, type AdminReview } from "@/components/admin/ModerationReview";
import { Pill } from "@/components/ui/Pill";
import { requireAdmin } from "@/lib/admin";
import { dayMonthYear } from "@/lib/checks";
import { ruleText } from "@/lib/moderation-text";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  target_type: "review" | "reply";
  target_id: string;
  source: "auto" | "user";
  rule: string;
  note: string | null;
  created_at: string;
  reporter_name: string | null;
  review: AdminReview | null;
  reply_body: string | null;
};

export default async function Flags() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_list_open_flags");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const now = new Date();
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="a-title">Flags</h1>
        <p className="a-lede">
          Automatic checks and residents&apos; reports. A report never changes a review on its own: you decide.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="empty">No open flags.</p>
      ) : (
        <div className="mod-list">
          {rows.map((f) => (
            <article key={f.id} className="a-card mod-card" aria-label={`Flag: ${ruleText(f.rule)}`}>
              <div className="mod-flag-head">
                <Pill tone={f.source === "user" ? "gold" : "outline"}>
                  {f.source === "user" ? "Report" : "Automatic"}
                </Pill>
                <span>
                  <b>{ruleText(f.rule)}</b> <code>{f.rule}</code>
                </span>
                <small>{dayMonthYear(f.created_at)}</small>
              </div>
              {f.source === "user" && (
                <p className="mod-report">
                  <span>{f.reporter_name ?? "A resident"} wrote:</span>
                  <q>{f.note}</q>
                </p>
              )}
              {f.review && <ModerationReview review={f.review} ageNow={now} />}
              {f.target_type === "reply" && f.reply_body && (
                <div className="mod-reply">
                  <b>The reply</b>
                  <p>{f.reply_body}</p>
                </div>
              )}
              <FlagActions flagId={f.id} />
              {f.target_type === "review" && f.review && f.review.status !== "removed" && (
                <details className="mod-more">
                  <summary>Remove the review instead</summary>
                  <ReviewActions reviewId={f.review.id} underCheck={false} />
                </details>
              )}
              {f.target_type === "reply" && (
                <details className="mod-more">
                  <summary>Remove the reply</summary>
                  <RemoveReplyForm replyId={f.target_id} />
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
