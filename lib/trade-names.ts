import { listCategoryGroups } from "@/lib/directory";

/** Category names for a trade field's suggestions. Public data; a form works without them. */
export async function tradeNames(): Promise<string[]> {
  try {
    const groups = await listCategoryGroups();
    return [...new Set(groups.flatMap((g) => g.categories.map((c) => c.name)))].sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.error("trade names: could not load the suggestions:", err);
    return [];
  }
}

/** The trades to tick on the trader form, by group, as the directory lists them. A form without them can't be sent. */
export async function tradeGroups(): Promise<{ name: string; trades: { slug: string; name: string }[] }[]> {
  try {
    const groups = await listCategoryGroups();
    return groups
      .map((g) => ({ name: g.group.name, trades: g.categories.map((c) => ({ slug: c.slug, name: c.name })) }))
      .filter((g) => g.trades.length > 0);
  } catch (err) {
    console.error("trade groups: could not load the trades:", err);
    return [];
  }
}
