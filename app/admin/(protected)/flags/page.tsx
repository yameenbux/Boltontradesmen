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

/** Open flags grouped by what they point at: one card per review (or reply), listing every rule it tripped. */
function groupByTarget(rows: Row[]): Row[][] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.target_type}:${r.target_id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()];
}

export default async function Flags() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_list_open_flags");
  if (error) throw new Error(error.message);
  const groups = groupByTarget((data ?? []) as Row[]);
  const now = new Date();
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="a-title">Flags</h1>
        <p className="a-lede">
          Automatic checks and residents&apos; reports, one card per review. A report never changes a review on its own:
          you decide.
        </p>
      </div>
      {groups.length === 0 ? (
        <p className="empty">No open flags.</p>
      ) : (
        <div className="mod-list">
          {groups.map((flags) => {
            const f = flags[0];
            const what = f.target_type === "reply" ? "Reply" : "Review";
            const label = f.review ? `${what} of ${f.review.business_name}` : what;
            return (
              <article
                key={`${f.target_type}:${f.target_id}`}
                className="a-card mod-card"
                aria-label={`Flags on ${label}: ${flags.map((x) => ruleText(x.rule)).join(", ")}`}
              >
                <ul className="mod-flag-list" aria-label={`${flags.length} open ${flags.length === 1 ? "flag" : "flags"}`}>
                  {flags.map((x) => (
                    <li key={x.id}>
                      <div className="mod-flag-head">
                        <Pill tone={x.source === "user" ? "gold" : "outline"}>
                          {x.source === "user" ? "Report" : "Automatic"}
                        </Pill>
                        <span>
                          <b>{ruleText(x.rule)}</b> <code>{x.rule}</code>
                        </span>
                        <small>{dayMonthYear(x.created_at)}</small>
                      </div>
                      {x.source === "user" && (
                        <p className="mod-report">
                          <span>{x.reporter_name ?? "A resident"} wrote:</span>
                          <q>{x.note}</q>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {f.review && <ModerationReview review={f.review} ageNow={now} />}
                {f.target_type === "reply" && f.reply_body && (
                  <div className="mod-reply">
                    <b>The reply</b>
                    <p>{f.reply_body}</p>
                  </div>
                )}
                <FlagActions flagIds={flags.map((x) => x.id)} />
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
            );
          })}
        </div>
      )}
    </main>
  );
}
