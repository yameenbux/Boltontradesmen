"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { matchCategory } from "@/lib/category-search";

type Cat = { slug: string; name: string };

// Example searches the placeholder cycles through (spec: every 2.4s, paused on focus or while typing).
const TRIES = ["plumber", "bouncy castle", "birthday cake", "man and van", "boiler service", "driving lessons"];
const ROTATE_MS = 2400;

/**
 * Hero search. Submitting a full or partial trade name goes straight to its category page (client-side);
 * anything else shows an inline "No trade called …" message with a link down to the full list.
 */
export function HomeSearch({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [tryIndex, setTryIndex] = useState(0);
  const [noMatch, setNoMatch] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      const el = input.current;
      if (!el || document.activeElement === el || el.value) return;
      setTryIndex((i) => (i + 1) % TRIES.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  // Warm the likely destination while the person is still typing.
  const match = matchCategory(value, categories);
  useEffect(() => {
    if (match) router.prefetch(`/c/${match.slug}`);
  }, [match, router]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim();
    if (!q) {
      input.current?.focus();
      return;
    }
    if (match) {
      setNoMatch(null);
      router.push(`/c/${match.slug}`);
    } else {
      setNoMatch(q);
    }
  }

  return (
    <>
      <form className="search" role="search" onSubmit={submit}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <label htmlFor="q" className="sr-only">
          What do you need?
        </label>
        <input
          ref={input}
          id="q"
          name="q"
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          placeholder={`Try “${TRIES[tryIndex]}”`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setNoMatch(null);
          }}
        />
        <button type="submit" className="press">
          Find
        </button>
      </form>
      <div className="search-msg" aria-live="polite">
        {noMatch !== null && (
          <p>
            No trade called “{noMatch}” yet. <a href="#all-trades">Browse all trades</a>
          </p>
        )}
      </div>
    </>
  );
}
