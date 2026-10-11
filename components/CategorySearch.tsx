"use client";

import Link from "next/link";
import { useState } from "react";

type Group = { name: string; slug: string; categories: { slug: string; name: string }[] };

export function CategorySearch({ groups }: { groups: Group[] }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const matches = term
    ? groups.flatMap((g) => g.categories).filter((c) => c.name.toLowerCase().includes(term) || c.slug.includes(term))
    : [];
  const link =
    "flex min-h-12 items-center rounded-lg border border-neutral-300 px-4 text-base font-medium hover:border-neutral-900";

  return (
    <>
      <label htmlFor="search" className="block text-lg font-semibold">
        What do you need?
      </label>
      <input
        id="search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="What do you need?"
        autoComplete="off"
        className="mt-1 min-h-12 w-full rounded-lg border-2 border-neutral-400 px-3 text-base text-neutral-900"
      />

      {term ? (
        matches.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {matches.map((c) => (
              <li key={c.slug}>
                <Link href={`/c/${c.slug}`} className={link}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4">Nothing matches &ldquo;{q}&rdquo; yet. Try a simpler word.</p>
        )
      ) : (
        groups.map((g) => (
          <section key={g.slug} className="mt-8">
            <h2 className="mb-3 text-xl font-bold">{g.name}</h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {g.categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/c/${c.slug}`} className={link}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
