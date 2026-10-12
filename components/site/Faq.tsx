"use client";

import { useId, useState } from "react";
import { type Faq as FaqItem, matchesFaq } from "@/components/site/content";
import { Icon } from "@/components/site/icons";

// FAQ accordion (native <details>, so it opens without JavaScript) with a live search filter.
export function Faq({ items }: { items: FaqItem[] }) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const shown = items.map((f) => matchesFaq(f, query));
  const none = !shown.some(Boolean);

  return (
    <div className="s-faq">
      <form role="search" className="s-search" onSubmit={(e) => e.preventDefault()}>
        <Icon name="search" />
        <label htmlFor={inputId} className="s-sr">
          Search questions
        </label>
        <input
          id={inputId}
          type="search"
          placeholder="Search questions"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      <div className="s-qs">
        {items.map((f, i) => (
          <details key={f.q} className="faq-item" hidden={!shown[i]}>
            <summary>
              <span>{f.q}</span>
              <Icon name="chevron" />
            </summary>
            <div className="a">
              {f.a.map((para, j) => (
                <p key={j}>
                  {para.map((seg, k) =>
                    typeof seg === "string" ? (
                      seg
                    ) : (
                      <a key={k} href={seg.href}>
                        {seg.label}
                      </a>
                    ),
                  )}
                </p>
              ))}
            </div>
          </details>
        ))}
      </div>

      <div aria-live="polite">
        {none && <p className="s-nomatch">No questions match that. Try another word, or raise a support ticket below.</p>}
      </div>
    </div>
  );
}
