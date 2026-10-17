import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { CanHelpCard, RecommendationCard } from "@/components/ask/Recommendations";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { platformPath } from "@/lib/paths";
import { askedOn, closesAt, groupRecommendations, isQuestionOpen } from "@/lib/questions";
import { getPublicQuestion, listQuestionAnswers } from "@/lib/questions-public";
import { ID_PATTERN } from "@/lib/review-form";
import { breadcrumbJsonLd, questionMetadata } from "@/lib/seo";

// Static and cookie-free like a profile: answering, approving and removing refresh it (revalidateQuestionPages);
// otherwise it's rebuilt at most every 5 minutes, which is also when an open question shows as closed.
export const revalidate = 300;

// No pages at build time; each is rendered on first request, then cached for `revalidate` seconds.
export function generateStaticParams() {
  return [];
}

async function load(id: string) {
  return ID_PATTERN.test(id) ? getPublicQuestion(id) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const q = await load((await params).id);
  return q ? questionMetadata(q) : {};
}

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const q = await load((await params).id);
  if (!q) notFound();
  const answers = await listQuestionAnswers(q.id);
  const groups = groupRecommendations(answers);
  const canHelp = answers.filter((a) => a.kind === "can_help");
  const open = isQuestionOpen(q.createdAt);
  const until = askedOn(closesAt(q.createdAt).toISOString());
  const trail = [
    { name: "Trades", path: platformPath() },
    { name: "Ask Bolton", path: platformPath("ask") },
    { name: `${q.categoryName} in ${q.district}`, path: platformPath("ask", q.id) },
  ];
  const answerHref = platformPath("ask", q.id, "answer");

  return (
    <main className="ask question">
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <Breadcrumbs trail={trail} />

      <section className="qhead" aria-labelledby="question-title">
        <p className="qmeta">
          <Link href={platformPath("c", q.categorySlug)} className="qtrade">
            {q.categoryName}
          </Link>
          <span className="qdot" aria-hidden="true">
            ·
          </span>
          <span>{q.district}</span>
          <Pill tone={open ? "sage" : "muted"} className="qstate">
            {open ? "Open" : "Closed"}
          </Pill>
        </p>
        <h1 id="question-title">{q.body}</h1>
        <p className="qasked">
          Asked by {q.askerName} on {askedOn(q.createdAt)}
        </p>
        {open ? (
          <>
            <Button href={answerHref}>Recommend someone</Button>
            <p className="qhint">
              Open for answers until {until}. Answers name someone listed here; traders listed for{" "}
              {q.categoryName.toLowerCase()} can say they can help.
            </p>
          </>
        ) : (
          <p className="form-note" role="status">
            This question closed on {until}, so it can&apos;t take new answers. Still looking? Ask again.
          </p>
        )}
      </section>

      <section aria-labelledby="recs-title">
        <div className="subhead">
          <h2 id="recs-title">Recommended by locals</h2>
          {groups.length > 0 && <span className="tag">{answers.length - canHelp.length} so far</span>}
        </div>
        {groups.length > 0 ? (
          <div className="rec-list stagger" data-testid="recommendations">
            {groups.map((g) => (
              <RecommendationCard key={g.providerId} questionId={q.id} g={g} />
            ))}
          </div>
        ) : (
          <p className="empty">
            No recommendations yet.
            {open ? " Used someone good who's listed here? Recommend them." : ""}
          </p>
        )}
      </section>

      {canHelp.length > 0 && (
        <section aria-labelledby="help-title">
          <div className="subhead">
            <h2 id="help-title">Traders who can help</h2>
          </div>
          <p className="muted">
            These traders replied about their own business. They aren&apos;t recommendations.
          </p>
          <div className="rec-list" data-testid="can-help">
            {canHelp.map((a) => (
              <CanHelpCard key={a.id} questionId={q.id} a={a} />
            ))}
          </div>
        </section>
      )}

      <div className="q-foot">
        <Link href={platformPath("c", q.categorySlug)} className="link">
          See everyone listed for {q.categoryName.toLowerCase()}
        </Link>
        <a href={platformPath("ask", q.id, "report")} className="rec-report-link">
          Report this question
        </a>
      </div>
      <p className="muted q-rules">
        Recommendations aren&apos;t reviews: they don&apos;t change anyone&apos;s rating, badge or place in the lists.
      </p>
    </main>
  );
}
