// Pure helpers for the home page: used by the server page (popularCategories) and the client search (matchCategory).

type Named = { slug: string; name: string };

// Words too short or too common to pick a trade on their own.
const FILLER = new Set(["and", "the", "for", "with", "near", "local", "someone", "need"]);

// Accents dropped both sides, so "canapes" finds "Catering & canapés".
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
// "man and van" / "Man & van" -> "man-and-van", the same shape as a slug.
const slugish = (s: string) => norm(s).replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Best category for a search, or null. Trimmed and case-insensitive. Tries, in order:
 * a prefix of the name or slug, then a substring of either, then (for multi-word searches such as
 * "birthday cake") each word of 3+ letters on its own by the same two rules.
 */
export function matchCategory<T extends Named>(query: string, categories: readonly T[]): T | null {
  const q = norm(query);
  if (!q) return null;
  const qs = slugish(q);

  const find = (term: string, termSlug: string) => {
    const name = (c: T) => norm(c.name);
    return (
      categories.find((c) => name(c).startsWith(term) || (termSlug && c.slug.startsWith(termSlug))) ??
      categories.find((c) => name(c).includes(term) || (termSlug && c.slug.includes(termSlug))) ??
      null
    );
  };

  const whole = find(q, qs);
  if (whole) return whole;

  const words = q.split(" ").filter((w) => w.length >= 3 && !FILLER.has(w));
  for (const w of words) {
    const hit = find(w, slugish(w));
    if (hit) return hit;
  }
  return null;
}

/** Categories with at least one live provider, most providers first, then by name; at most `limit`. */
export function popularCategories<T extends Named & { liveCount: number }>(
  groups: readonly { categories: readonly T[] }[],
  limit = 8,
): T[] {
  return groups
    .flatMap((g) => g.categories)
    .filter((c) => c.liveCount >= 1)
    .sort((a, b) => b.liveCount - a.liveCount || a.name.localeCompare(b.name))
    .slice(0, limit);
}
