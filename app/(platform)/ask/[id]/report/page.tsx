import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ReportContentForm } from "@/components/ask/ReportContentForm";
import { requireMember } from "@/lib/auth";
import { platformPath } from "@/lib/paths";
import { getPublicAnswer, getPublicQuestion } from "@/lib/questions-public";
import { ID_PATTERN } from "@/lib/review-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Report | Bolton Vouched",
  description: "Tell us what's wrong with a question or an answer and we'll take a look.",
  robots: { index: false },
};

export default async function ReportQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const rawAnswer = (await searchParams).answer;
  const answerId = typeof rawAnswer === "string" && ID_PATTERN.test(rawAnswer) ? rawAnswer : null;
  const here = ID_PATTERN.test(id)
    ? `${platformPath("ask", id, "report")}${answerId ? `?answer=${answerId}` : ""}`
    : platformPath("ask");
  await requireMember(here);
  if (!ID_PATTERN.test(id)) notFound();
  const q = await getPublicQuestion(id);
  if (!q) notFound();
  const answer = answerId ? await getPublicAnswer(answerId) : null;
  if (answerId && (!answer || answer.questionId !== q.id)) notFound();
  const back = platformPath("ask", q.id);
  const what = !answer
    ? "this question"
    : answer.kind === "can_help"
      ? `${answer.businessName}'s reply`
      : `${answer.authorName}'s recommendation`;

  return (
    <main className="auth">
      <Breadcrumbs
        plain
        trail={[
          { name: "Ask Bolton", path: platformPath("ask") },
          { name: `${q.categoryName} in ${q.district}`, path: back },
          { name: "Report", path: here },
        ]}
      />
      <section className="auth-card" aria-labelledby="report-title">
        <div>
          <p className="eyebrow">Report</p>
          <h1 id="report-title">Something wrong with {what}?</h1>
          <p className="lede">Tell us and the admin will look. Things come down only for a good reason.</p>
        </div>
        <figure className="report-quote">
          <figcaption>
            {answer ? (
              answer.kind === "can_help" ? (
                <>
                  <b>{answer.businessName}</b> says they can help
                </>
              ) : (
                <>
                  <b>{answer.authorName}</b> recommends {answer.businessName}
                </>
              )
            ) : (
              <>
                <b>{q.askerName}</b> asked, in {q.categoryName}
              </>
            )}
          </figcaption>
          {answer ? (
            answer.note ? (
              <blockquote>{answer.note}</blockquote>
            ) : (
              <p className="no-comment">No note, just the recommendation.</p>
            )
          ) : (
            <blockquote>{q.body}</blockquote>
          )}
        </figure>
        <ReportContentForm questionId={q.id} answerId={answer?.id ?? null} backHref={back} />
      </section>
    </main>
  );
}
