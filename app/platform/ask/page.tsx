import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { QuestionFilter } from "@/components/ask/QuestionFilter";
import { Button } from "@/components/ui/Button";
import { platformPath } from "@/lib/paths";
import { QUESTION_OPEN_DAYS } from "@/lib/questions";
import { listRecentQuestions } from "@/lib/questions-public";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

// Static and cookie-free: the trade and area chips filter client-side, so no searchParams. Posting and answering
// refresh it (revalidateQuestionPages); otherwise it's rebuilt at most every 5 minutes.
export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Ask Bolton: who do locals recommend? | Bolton Vouched",
  description:
    "Anyone know a good electrician in BL3? Ask Bolton residents and they'll point you to traders listed on Bolton Vouched. Free to read; sign in to ask or answer.",
  path: platformPath("ask"),
});

export default async function AskPage() {
  const questions = await listRecentQuestions();
  const trail = [
    { name: "Trades", path: platformPath() },
    { name: "Ask Bolton", path: platformPath("ask") },
  ];

  return (
    <main className="ask">
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <Breadcrumbs trail={trail} />
      <h1 className="page-title">Ask Bolton</h1>
      <p className="page-sub">
        &ldquo;Anyone know a good…?&rdquo; Ask the neighbours. Every answer points to someone listed here.
      </p>
      <div className="ask-cta">
        {/* A plain link: asking needs sign-in, which reads cookies; this page never does. */}
        <Button href={platformPath("ask", "new")}>Ask a question</Button>
        <p className="muted">
          Questions stay open for {QUESTION_OPEN_DAYS} days. Recommendations don&apos;t change anyone&apos;s rating or
          their place in the lists.
        </p>
      </div>

      {questions.length > 0 ? (
        <QuestionFilter questions={questions} renderedAt={new Date().toISOString()} />
      ) : (
        <p className="empty list">No questions yet. Ask the first one and the neighbours will point you to someone.</p>
      )}
    </main>
  );
}
