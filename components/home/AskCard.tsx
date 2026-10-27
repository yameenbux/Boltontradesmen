import Link from "next/link";
import { ChatIcon } from "@/components/ask/QuestionCard";
import { platformPath } from "@/lib/paths";

/** The directory home's way into community questions: one slim row, for when the trade isn't listed yet. */
export function AskCard() {
  return (
    <section className="ask-slim" aria-labelledby="ask-slim-title">
      <span className="ask-ic" aria-hidden="true">
        <ChatIcon />
      </span>
      <span className="ask-slim-tx">
        <b id="ask-slim-title">Can&apos;t find who you need?</b>
        <span>
          <Link href={platformPath("ask")}>Ask Bolton</Link>: neighbours point you to someone listed.
        </span>
      </span>
      <Link href={platformPath("ask", "new")} className="btn btn-dark press">
        Ask
      </Link>
    </section>
  );
}
