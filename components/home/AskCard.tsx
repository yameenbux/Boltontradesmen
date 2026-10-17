import Link from "next/link";
import { ChatIcon } from "@/components/ask/QuestionCard";
import { Button } from "@/components/ui/Button";
import { platformPath } from "@/lib/paths";
import { recommendationCount, type PublicQuestion } from "@/lib/questions";

/** The directory home's way into community questions: ask, or read the latest (up to two). */
export function AskCard({ latest }: { latest: PublicQuestion[] }) {
  return (
    <section className="ask-card" aria-labelledby="ask-card-title">
      <div className="ask-card-head">
        <span className="ask-ic" aria-hidden="true">
          <ChatIcon />
        </span>
        <div>
          <h2 id="ask-card-title">Ask Bolton</h2>
          <p>Anyone know a good…? Ask the neighbours and they&apos;ll point you to someone listed here.</p>
        </div>
      </div>
      {latest.length > 0 && (
        <ul className="ask-latest" aria-label="Latest questions">
          {latest.map((q) => (
            <li key={q.id}>
              <Link href={platformPath("ask", q.id)} className="press">
                <span className="ask-q">{q.body}</span>
                <small>
                  {q.categoryName} · {q.district} · {recommendationCount(q.recommendationCount)}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="ask-card-actions">
        <Button href={platformPath("ask", "new")}>Ask a question</Button>
        <Link href={platformPath("ask")} className="link">
          See all questions
        </Link>
      </div>
    </section>
  );
}
