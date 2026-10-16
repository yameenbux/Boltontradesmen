import type { Metadata } from "next";
import { ReviewCardSheet } from "@/components/review-card/ReviewCard";
import { Button } from "@/components/ui/Button";
import { requireMember } from "@/lib/auth";
import { platformPath } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Review card | Bolton Vouched",
  description: "A printable card with a QR code your customers scan to review you on Bolton Vouched.",
  robots: { index: false },
};

/** The linked trader's printable review card, one per listing linked to their account. */
export default async function ProviderCardPage() {
  const { account } = await requireMember(platformPath("provider", "card"));
  const listings = account.providers.filter((p) => p.status !== "removed");

  if (listings.length === 0) {
    return (
      <main className="auth">
        <section className="auth-card" aria-labelledby="card-title">
          <div>
            <p className="eyebrow">Review card</p>
            <h1 id="card-title">No listing found</h1>
            <p className="lede">
              We couldn&apos;t find a listing linked to your account. If you&apos;re listed, ask us for your trader
              sign-in link.
            </p>
          </div>
          <Button href={platformPath("account")} variant="secondary">
            Back to your account
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth">
      {listings.map((p) => (
        <ReviewCardSheet
          key={p.id}
          businessName={p.businessName}
          slug={p.slug}
          live={p.status === "live"}
          back={
            <a href={platformPath("provider")} className="rcard-back">
              ← Your listing
            </a>
          }
        />
      ))}
    </main>
  );
}
