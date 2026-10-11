import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DistrictFilter } from "@/components/DistrictFilter";
import { listCategoryGroups, listProvidersInCategory } from "@/lib/directory";

export const revalidate = 300;

// No pages at build time; each is rendered on first request, then cached for `revalidate` seconds.
export function generateStaticParams() {
  return [];
}

async function findCategory(slug: string) {
  const groups = await listCategoryGroups();
  for (const { group, categories } of groups) {
    const category = categories.find((c) => c.slug === slug);
    if (category) return { group, category };
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const found = await findCategory((await params).category);
  return found ? { title: `${found.category.name} in Bolton | Bolton Vouched` } : {};
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const slug = (await params).category;
  const found = await findCategory(slug);
  if (!found) notFound();
  const { ranked, newcomers } = await listProvidersInCategory(slug);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="inline-flex min-h-12 items-center font-semibold underline">
        ← All categories
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight">{found.category.name}</h1>
      {found.category.guidanceNote && (
        <p className="mt-3 rounded-lg border-l-4 border-amber-600 bg-amber-50 p-3 text-base text-neutral-900">
          {found.category.guidanceNote}
        </p>
      )}
      <DistrictFilter ranked={ranked} newcomers={newcomers} />
    </main>
  );
}
