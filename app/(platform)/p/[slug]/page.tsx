import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ActionBar } from "@/components/profile/ActionBar";
import { Button } from "@/components/ui/Button";
import { ChecksList } from "@/components/profile/ChecksList";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ShareProfile } from "@/components/profile/ShareProfile";
import { ReviewList } from "@/components/profile/ReviewList";
import { StatCard } from "@/components/profile/StatCard";
import { WorkGallery } from "@/components/profile/WorkGallery";
import { ratingBadge } from "@/lib/badges";
import { getProvider, listCategoryGroups } from "@/lib/directory";
import { firstName } from "@/lib/initials";
import { platformPath } from "@/lib/paths";
import { listProviderReviews } from "@/lib/reviews";
import { profileShare } from "@/lib/share";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd, type Crumb, providerJsonLd, providerMetadata } from "@/lib/seo";

export const revalidate = 300;

// No pages at build time; each is rendered on first request, then cached for `revalidate` seconds.
export function generateStaticParams() {
  return [];
}

// The provider's live trades, in their category order, with display names.
async function tradesOf(categorySlugs: string[]) {
  const names = new Map(
    (await listCategoryGroups()).flatMap(({ categories }) => categories.map((c) => [c.slug, c.name] as const)),
  );
  return categorySlugs.flatMap((s) => {
    const name = names.get(s);
    return name ? [{ slug: s, name }] : [];
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProvider((await params).slug);
  if (!p) return {};
  const trades = await tradesOf(p.categorySlugs);
  return providerMetadata({ ...p, trade: trades[0]?.name ?? null });
}

/** Trades › first trade › business (the trade is left out when the provider has no live category). */
function profileTrail(p: { slug: string; businessName: string }, trade?: { slug: string; name: string }): Crumb[] {
  return [
    { name: "Trades", path: platformPath() },
    ...(trade ? [{ name: trade.name, path: platformPath("c", trade.slug) }] : []),
    { name: p.businessName, path: platformPath("p", p.slug) },
  ];
}

export default async function ProviderPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProvider((await params).slug);
  if (!p) notFound();

  // Trade names for the header and the breadcrumbs, in the provider's category order.
  const trades = await tradesOf(p.categorySlugs);
  const reviews = await listProviderReviews(p.id);
  const trail = profileTrail(p, trades[0]);

  return (
    <main className="profile">
      <JsonLd data={providerJsonLd({ ...p, trade: trades[0]?.name ?? null })} />
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <Breadcrumbs trail={trail} />
      <ProfileHeader
        businessName={p.businessName}
        contactName={p.contactName}
        trades={trades.map((t) => t.name)}
        isVerified={p.isVerified}
        idChecked={p.idChecked}
        badge={ratingBadge(p)}
        areas={p.areas}
        availability={p.availability}
        share={<ShareProfile {...profileShare(p.slug, p.businessName)} />}
      />
      <StatCard stats={p} />
      {p.takesRequests && (
        <section className="card quote-card" aria-labelledby="quote-title">
          <h2 id="quote-title">Request a quote</h2>
          <p>Can&apos;t talk now? Describe the job and {firstName(p.contactName) ?? p.businessName} gets it by text straight away.</p>
          <Button href={platformPath("p", p.slug, "request")} variant="secondary">
            Request a quote
          </Button>
        </section>
      )}
      <ChecksList checks={p.checks} idChecked={p.idChecked} />
      {p.bio && (
        <section className="card" aria-labelledby="about-title">
          <h2 id="about-title">About</h2>
          <p className="bio">{p.bio}</p>
        </section>
      )}
      <WorkGallery photos={p.photos} businessName={p.businessName} />
      <ReviewList reviews={reviews} slug={p.slug} businessName={p.businessName} />
      <ActionBar
        slug={p.slug}
        businessName={p.businessName}
        contactFirstName={firstName(p.contactName)}
        hasWhatsapp={p.hasWhatsapp}
      />
    </main>
  );
}
