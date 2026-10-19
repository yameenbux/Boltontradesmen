"use client";

import { useState } from "react";
import { QuestionCard } from "@/components/ask/QuestionCard";
import { BL_DISTRICTS } from "@/lib/districts";
import type { PublicQuestion } from "@/lib/questions";

/**
 * Trade and area chips over the questions list. Filters client-side, so /ask stays static (no searchParams)
 * and cacheable, as the category page's area filter does. The order is the server's (newest first), unchanged.
 */
export function QuestionFilter({ questions, renderedAt }: { questions: PublicQuestion[]; renderedAt: string }) {
  const [trade, setTrade] = useState("");
  const [area, setArea] = useState("");
  const now = new Date(renderedAt);
  // Only the trades that have been asked about, in name order.
  const trades = [...new Map(questions.map((q) => [q.categorySlug, q.categoryName])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const shown = questions.filter((q) => (!trade || q.categorySlug === trade) && (!area || q.district === area));
  const tradeName = trades.find(([slug]) => slug === trade)?.[1];

  return (
    <>
      {trades.length > 1 && (
        <div className="areas" role="group" aria-label="Trade">
          {[["", "All trades"] as const, ...trades].map(([slug, name]) => (
            <button
              key={slug || "all"}
              type="button"
              className="chip press"
              aria-pressed={trade === slug}
              onClick={() => setTrade(slug)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="areas" role="group" aria-label="Area">
        {["", ...BL_DISTRICTS].map((a) => (
          <button key={a || "all"} type="button" className="chip press" aria-pressed={area === a} onClick={() => setArea(a)}>
            {a || "All of Bolton"}
          </button>
        ))}
      </div>

      {shown.length > 0 && (
        // Keyed by the filters so the cards rise again when they change.
        <ul className="list stagger" data-testid="question-list" key={`${trade}-${area}`}>
          {shown.map((q) => (
            <li key={q.id}>
              <QuestionCard q={q} now={now} />
            </li>
          ))}
        </ul>
      )}
      <div aria-live="polite">
        {shown.length === 0 && (
          <p className="empty list">
            No questions{tradeName ? ` about ${tradeName.toLowerCase()}` : ""}
            {area ? ` in ${area}` : ""} yet. Be the first to ask.
          </p>
        )}
      </div>
    </>
  );
}
