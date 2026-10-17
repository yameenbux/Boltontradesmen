"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProviderCard } from "@/components/ProviderCard";
import { ContactButtons } from "@/components/ask/Recommendations";
import type { AskMatches as Matches } from "@/lib/ask-matches";
import { platformPath } from "@/lib/paths";

type Loaded = { key: string; data: Matches | null };

/**
 * Traders already listed for the chosen trade and area, shown while the person is still writing: often that's the
 * answer, and posting is only needed when they want the neighbours' view or nobody covers the area yet.
 */
export function AskMatches({ slug, tradeName, district }: { slug: string; tradeName: string; district: string }) {
  const key = slug && district ? `${slug}|${district}` : "";
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ category: slug, district });
    fetch(`/api/ask-matches?${qs}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Matches>) : null))
      .then((data) => setLoaded({ key, data }))
      // A failed lookup just shows nothing: the question form still works.
      .catch(() => {});
    return () => ctrl.abort();
  }, [key, slug, district]);

  if (!key || !loaded || loaded.key !== key || !loaded.data) return null;
  const { total, top } = loaded.data;

  if (total === 0) {
    return (
      <section className="ask-matches none" aria-live="polite" data-testid="ask-matches">
        <p>
          Nobody listed covers <b>{district}</b> for {tradeName} yet. Post your question and the
          neighbours can point you to someone.
        </p>
      </section>
    );
  }

  return (
    <section className="ask-matches" aria-live="polite" aria-labelledby="ask-matches-title" data-testid="ask-matches">
      <h2 id="ask-matches-title">
        Already listed for {district}: {total} {total === 1 ? "trader" : "traders"}
      </h2>
      <p className="ask-matches-sub">{tradeName}, vouched for by Bolton residents. You can contact them now.</p>
      <ul className="list">
        {top.map((p) => (
          <li key={p.id} className="ask-match">
            <ProviderCard provider={p} />
            <ContactButtons slug={p.slug} businessName={p.businessName} hasWhatsapp={p.hasWhatsapp} />
          </li>
        ))}
      </ul>
      {total > top.length && (
        <Link href={platformPath("c", slug)} className="link">
          See all {total} for {tradeName}
        </Link>
      )}
      <p className="ask-matches-or">Still want the neighbours&apos; view? Post your question below.</p>
    </section>
  );
}
