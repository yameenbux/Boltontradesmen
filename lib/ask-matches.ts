import type { PublicProvider } from "@/lib/directory";

export const ASK_MATCH_LIMIT = 3;

export type AskMatches = { total: number; top: PublicProvider[] };

/** The category page's order (scored traders first, then the newest without enough reviews), cut to the top few. */
export function askMatches(
  { ranked, newcomers }: { ranked: PublicProvider[]; newcomers: PublicProvider[] },
  limit = ASK_MATCH_LIMIT,
): AskMatches {
  const all = [...ranked, ...newcomers];
  return { total: all.length, top: all.slice(0, limit) };
}
