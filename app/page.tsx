import { CategorySearch } from "@/components/CategorySearch";
import { listCategoryGroups } from "@/lib/directory";

// Only seed-level data (categories) is shown, so the page can be cached and refreshed every 5 minutes.
export const revalidate = 300;

export default async function Home() {
  const groups = (await listCategoryGroups()).map(({ group, categories }) => ({
    name: group.name,
    slug: group.slug,
    categories: categories.map((c) => ({ slug: c.slug, name: c.name })),
  }));
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Bolton Vouched</h1>
      <p className="mb-6 mt-1 text-lg text-neutral-700">Local people, vouched for by Bolton.</p>
      <CategorySearch groups={groups} />
    </main>
  );
}
