import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaFilter } from "@/components/category/AreaFilter";
import { localPros } from "@/components/home/CategoryTile";
import { listCategoryGroups, listProvidersInCategory } from "@/lib/directory";
import { platformPath } from "@/lib/paths";
import { categoryMetadata } from "@/lib/seo";

// Static and cookie-free: the area filter runs client-side, so no searchParams.
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
  return found ? categoryMetadata(found.category) : {};
}

const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const Info = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const slug = (await params).category;
  const found = await findCategory(slug);
  if (!found) notFound();
  const { name, guidanceNote } = found.category;
  const { ranked, newcomers } = await listProvidersInCategory(slug);
  const total = new Set([...ranked, ...newcomers].map((p) => p.id)).size;

  return (
    <main>
      <Link href={platformPath()} className="back press">
        <Chevron />
        All trades
      </Link>
      <h1 className="page-title">{name}</h1>
      {total > 0 && <p className="page-sub">{localPros(total)} · reviews coming soon</p>}

      {guidanceNote && (
        <p className="note">
          <Info />
          <span>{guidanceNote}</span>
        </p>
      )}

      {total > 0 ? (
        <AreaFilter ranked={ranked} newcomers={newcomers} />
      ) : (
        <div className="empty cat-empty">
          <p>
            <b>Nobody&apos;s listed for {name} yet.</b>
          </p>
          <p>Know a good one? Message the group admin to get them added.</p>
          <Link href={platformPath()} className="link">
            Browse other trades
          </Link>
        </div>
      )}
    </main>
  );
}
