import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ChatIcon } from "@/components/ask/QuestionCard";
import { AreaFilter } from "@/components/category/AreaFilter";
import { localPros } from "@/components/home/CategoryTile";
import { listCategoryGroups, listProvidersInCategory } from "@/lib/directory";
import { platformPath } from "@/lib/paths";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd, categoryMetadata } from "@/lib/seo";

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
  const trail = [
    { name: "Trades", path: platformPath() },
    { name, path: platformPath("c", slug) },
  ];

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <Breadcrumbs trail={trail} />
      <h1 className="page-title">{name}</h1>
      {total > 0 && <p className="page-sub">{localPros(total)} · ranked by reviews</p>}

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

      {/* A plain link: asking needs sign-in (cookies), and this page stays static. */}
      <a href={`${platformPath("ask", "new")}?category=${encodeURIComponent(slug)}`} className="ask-nudge press lift">
        <span className="ask-ic" aria-hidden="true">
          <ChatIcon />
        </span>
        <span>
          <b>Can&apos;t decide? Ask Bolton</b>
          <small>Ask the neighbours who they&apos;d use for {name.toLowerCase()}.</small>
        </span>
      </a>
    </main>
  );
}
