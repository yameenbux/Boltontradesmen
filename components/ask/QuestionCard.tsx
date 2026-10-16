import Link from "next/link";
import { Pill } from "@/components/ui/Pill";
import { platformPath } from "@/lib/paths";
import { askedOn, isQuestionOpen, recommendationCount, type PublicQuestion } from "@/lib/questions";

export const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5Z" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.2M12 16.5h.01" />
  </svg>
);

/**
 * One question in a list: its trade and area, open or closed, the question, who asked and when, and how many
 * recommendations. `now` is when the page was rendered (a cached page shows the state as of then).
 */
export function QuestionCard({ q, now }: { q: PublicQuestion; now: Date }) {
  const open = isQuestionOpen(q.createdAt, now);
  return (
    <Link href={platformPath("ask", q.id)} className="qcard press lift">
      <span className="qmeta">
        <span className="qtrade">{q.categoryName}</span>
        <span className="qdot" aria-hidden="true">
          ·
        </span>
        <span>{q.district}</span>
        <Pill tone={open ? "sage" : "muted"} className="qstate">
          {open ? "Open" : "Closed"}
        </Pill>
      </span>
      <span className="qbody">{q.body}</span>
      <span className="qfoot">
        <span>
          {q.askerName} · {askedOn(q.createdAt)}
        </span>
        <b data-some={q.recommendationCount > 0 ? "" : undefined}>{recommendationCount(q.recommendationCount)}</b>
      </span>
    </Link>
  );
}
