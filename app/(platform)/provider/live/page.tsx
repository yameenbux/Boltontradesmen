import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TickIcon } from "@/components/auth/icons";
import { Button } from "@/components/ui/Button";
import { requireAccount } from "@/lib/auth";
import { platformPath } from "@/lib/paths";
import { pageShare } from "@/lib/share";
import type { MyListingRequest } from "@/lib/trader-setup";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "You're now live | Bolton Vouched",
  description: "Your Bolton Vouched listing is live: see your page and share it.",
  robots: { index: false, follow: false },
};

type Listing = { provider: { id: string; slug: string; business_name: string; status: string } };

/** Where the trader's one form lands: their listing is live. Share it, see it, or go to the dashboard. */
export default async function YouAreLivePage() {
  const { supabase, account } = await requireAccount(platformPath("provider", "live"));
  if (!account?.displayName) redirect(platformPath("provider"));
  const [{ data, error }, { data: req }] = await Promise.all([
    supabase.rpc("provider_my_reviews"),
    supabase.rpc("my_listing_request"),
  ]);
  if (error) throw new Error(`provider_my_reviews failed: ${error.message}`);
  const p = ((data ?? []) as Listing[]).map((l) => l.provider).find((x) => x.status === "live");
  if (!p) redirect(platformPath("provider"));
  const share = pageShare(p.slug, p.business_name);
  const pro = (req as MyListingRequest | null)?.plan === "pro";

  return (
    <main className="auth">
      <section className="auth-card live-card" aria-labelledby="live-title" data-testid="you-are-live">
        <span className="live-tick" aria-hidden="true">
          <TickIcon />
        </span>
        <div>
          <p className="eyebrow">You&apos;re live</p>
          <h1 id="live-title">{p.business_name} is now live on Bolton Vouched</h1>
          <p className="lede">Customers can find you and call or WhatsApp you now.</p>
        </div>
        <Button href={share.whatsapp}>Share your page on WhatsApp</Button>
        <Button href={platformPath("p", p.slug)} variant="secondary">
          See your page
        </Button>
        {pro && (
          <Button href={`${platformPath("provider")}#pro`} variant="secondary">
            Start Pro: pay by card
          </Button>
        )}
        <Button href={platformPath("provider")} variant="secondary">
          Go to your dashboard
        </Button>
      </section>
    </main>
  );
}
