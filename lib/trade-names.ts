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
