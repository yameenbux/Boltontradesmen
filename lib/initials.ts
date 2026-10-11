/** Avatar initials from a business name: first letter of the first two words that start with a letter or digit. */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .filter(Boolean);
  return letters.slice(0, 2).join("").toUpperCase() || "?";
}

/** First word of a contact name ("Alan Ace" → "Alan"), or null when there is none. */
export function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}
