import type { Metadata } from "next";
import { HeldQuestionActions, ReportedActions } from "@/components/admin/QuestionActions";
import { Pill } from "@/components/ui/Pill";
import { requireAdmin } from "@/lib/admin";
import { dayMonthYear } from "@/lib/checks";
import { platformPath } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Questions | Admin | Bolton Vouched",
  description: "Held community questions and reported questions and answers waiting for a decision.",
};

type Held = {
  id: string;
  category_name: string;
  district: string;
  body: string;
  created_at: string;
  asker_name: string;
  sign_in_kind: string | null;
  account_created_at: string | null;
};
type Reported = {
  target_type: "question" | "answer";
  target_id: string;
  question_id: string;
  question_body: string;
  category_name: string;
  district: string;
  asker_name: string;
  answer: {
    kind: "recommend" | "can_help";
    business_name: string;
    provider_slug: string;
    note: string | null;
    author_name: string;
  } | null;
  reports: { id: string; note: string; created_at: string; reporter_name: string | null }[];
};

/** Community questions: those held from email-code accounts, then reported questions and answers still up. */
export default async function Questions() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_list_question_queue");
  if (error) throw new Error(error.message);
  const { held, reported } = (data ?? { held: [], reported: [] }) as { held: Held[]; reported: Reported[] };

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="a-title">Questions</h1>
        <p className="a-lede">
          Questions from email-code sign-ins wait here until you approve them. Reported questions and answers stay up
          until you remove them (with a reason, kept in the audit log) or dismiss the reports.
        </p>
      </div>

      <section className="a-section" aria-labelledby="held-title">
        <h2 id="held-title">Waiting for approval</h2>
        {held.length === 0 ? (
          <p className="empty">No questions waiting.</p>
        ) : (
          <div className="mod-list">
            {held.map((q) => (
              <article key={q.id} className="a-card mod-card" aria-label={`Held question from ${q.asker_name}`}>
                <div className="mod-flag-head">
                  <Pill tone="gold">Held</Pill>
                  <span>
                    <b>{q.category_name}</b> · {q.district}
                  </span>
                  <small>{dayMonthYear(q.created_at)}</small>
                </div>
                <p className="mod-comment">{q.body}</p>
                <p className="mod-who">
                  <b>{q.asker_name}</b> · signs in with {q.sign_in_kind === "email" ? "an email code" : (q.sign_in_kind ?? "unknown")}
                  {q.account_created_at ? ` · account since ${dayMonthYear(q.account_created_at)}` : ""}
                </p>
                <HeldQuestionActions questionId={q.id} />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="a-section" aria-labelledby="reported-title">
        <h2 id="reported-title">Reported</h2>
        {reported.length === 0 ? (
          <p className="empty">Nothing reported.</p>
        ) : (
          <div className="mod-list">
            {reported.map((r) => {
              const label =
                r.target_type === "question"
                  ? `Reported question from ${r.asker_name}`
                  : r.answer?.kind === "can_help"
                    ? `Reported reply from ${r.answer.business_name}`
                    : `Reported recommendation from ${r.answer?.author_name ?? "a resident"}`;
              return (
                <article key={`${r.target_type}:${r.target_id}`} className="a-card mod-card" aria-label={label}>
                  <ul className="mod-flag-list" aria-label={`${r.reports.length} open ${r.reports.length === 1 ? "report" : "reports"}`}>
                    {r.reports.map((x) => (
                      <li key={x.id}>
                        <div className="mod-flag-head">
                          <Pill tone="gold">Report</Pill>
                          <span>
                            <b>{r.target_type === "question" ? "Question" : "Answer"}</b>
                          </span>
                          <small>{dayMonthYear(x.created_at)}</small>
                        </div>
                        <p className="mod-report">
                          <span>{x.reporter_name ?? "A resident"} wrote:</span>
                          <q>{x.note}</q>
                        </p>
                      </li>
                    ))}
                  </ul>
                  <div className="mod-review">
                    <p className="mod-who">
                      <a href={platformPath("ask", r.question_id)} className="a-link">
                        {r.category_name} · {r.district}
                      </a>{" "}
                      · asked by <b>{r.asker_name}</b>
                    </p>
                    <p className="mod-comment">{r.question_body}</p>
                    {r.answer && (
                      <div className="mod-reply">
                        <b>
                          {r.answer.kind === "can_help"
                            ? `${r.answer.business_name} says they can help (by ${r.answer.author_name})`
                            : `${r.answer.author_name} recommends ${r.answer.business_name}`}
                        </b>
                        {r.answer.note ? <p>{r.answer.note}</p> : <p>No note.</p>}
                      </div>
                    )}
                  </div>
                  <ReportedActions targetType={r.target_type} targetId={r.target_id} />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
