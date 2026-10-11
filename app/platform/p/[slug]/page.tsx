import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionBar } from "@/components/profile/ActionBar";
import { ChecksList } from "@/components/profile/ChecksList";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { StatCard } from "@/components/profile/StatCard";
import { getProvider, listCategoryGroups } from "@/lib/directory";
import { firstName } from "@/lib/initials";
import { platformPath } from "@/lib/paths";

export const revalidate = 300;

// No pages at build time; each is rendered on first request, then cached for `revalidate` seconds.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProvider((await params).slug);
  return p ? { title: `${p.businessName} | Bolton Vouched` } : {};
}

const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export default async function ProviderPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProvider((await params).slug);
  if (!p) notFound();

  // Trade names for the header and the back link, in the provider's category order.
  const names = new Map(
    (await listCategoryGroups()).flatMap(({ categories }) => categories.map((c) => [c.slug, c.name] as const)),
  );
  const trades = p.categorySlugs.flatMap((s) => {
    const name = names.get(s);
    return name ? [{ slug: s, name }] : [];
  });
  const back = trades[0] ? { href: platformPath("c", trades[0].slug), label: trades[0].name } : { href: platformPath(), label: "All trades" };

  return (
    <main className="profile">
      <Link href={back.href} className="back press">
        <Chevron />
        {back.label}
      </Link>
      <ProfileHeader
        businessName={p.businessName}
        contactName={p.contactName}
        trades={trades.map((t) => t.name)}
        isVerified={p.isVerified}
        areas={p.areas}
      />
      <StatCard stats={p} />
      <ChecksList checks={p.checks} />
      {p.bio && (
        <section className="card" aria-labelledby="about-title">
          <h2 id="about-title">About</h2>
          <p className="bio">{p.bio}</p>
        </section>
      )}
      <ActionBar
        slug={p.slug}
        businessName={p.businessName}
        contactFirstName={firstName(p.contactName)}
        hasWhatsapp={p.hasWhatsapp}
      />
    </main>
  );
}
