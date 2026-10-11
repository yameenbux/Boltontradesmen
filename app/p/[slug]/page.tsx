import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChecksRow } from "@/components/ChecksRow";
import { ContactButtons } from "@/components/ContactButtons";
import { StatsBlock } from "@/components/StatsBlock";
import { getProvider } from "@/lib/directory";

export const revalidate = 300;

// No pages at build time; each is rendered on first request, then cached for `revalidate` seconds.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProvider((await params).slug);
  return p ? { title: `${p.businessName} | Bolton Vouched` } : {};
}

export default async function ProviderPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProvider((await params).slug);
  if (!p) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8">
      <Link href="/" className="inline-flex min-h-12 items-center font-semibold underline">
        ← Back to search
      </Link>
      <header>
        <h1 className="break-words text-3xl font-extrabold tracking-tight">{p.businessName}</h1>
        {p.contactName && <p className="text-lg text-neutral-800">{p.contactName}</p>}
        {p.isVerified && <p className="font-semibold text-emerald-900">✓ Verified</p>}
        {p.areas.length > 0 && <p className="mt-1 text-neutral-700">Covers {p.areas.join(", ")}</p>}
      </header>
      <ContactButtons slug={p.slug} hasWhatsapp={p.hasWhatsapp} />
      <StatsBlock stats={p} />
      <ChecksRow checks={p.checks} />
      {p.bio && (
        <section aria-label="About">
          <h2 className="text-lg font-bold">About</h2>
          <p className="mt-1 whitespace-pre-line text-base text-neutral-900">{p.bio}</p>
        </section>
      )}
    </main>
  );
}
