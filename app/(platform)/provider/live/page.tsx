import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TickIcon } from "@/components/auth/icons";
import { AvailabilityForm } from "@/components/provider/AvailabilityForm";
import { ShareReviewLink } from "@/components/review-card/ShareReviewLink";
import { GoogleProfileLink } from "@/components/share/GoogleProfileLink";
import { WebsiteBadge } from "@/components/share/WebsiteBadge";
import { Button } from "@/components/ui/Button";
import { setMyAvailability } from "@/app/(platform)/provider/actions";
import { requireAccount } from "@/lib/auth";
import { availabilityNow, bookedRange, type StoredAvailability } from "@/lib/availability";
import { platformPath } from "@/lib/paths";
import { reviewShare } from "@/lib/review-link";
import { badgeShare, googleProfileLink, pageShare } from "@/lib/share";
import type { MyListingRequest } from "@/lib/trader-setup";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "You're now live | Bolton Vouched",
  description: "Your Bolton Vouched listing is live: say if you're taking on work, ask for reviews and show your badge.",
  robots: { index: false, follow: false },
};

type Listing = {
  provider: { id: string; slug: string; business_name: string; status: string; availability?: StoredAvailability };
};

/**
 * Where the trader's one form lands: they're live. Three next steps, in the order that brings them work: say if
 * they're taking on work, ask their last customers for reviews, and show they're vouched (their page as their
 * website when they haven't one; the embed code when they have). The dashboard has all of this too.
 */
export default async function YouAreLivePage({ searchParams }: { searchParams: Promise<{ pro?: string }> }) {
  const { pro: proParam } = await searchParams;
  const { supabase, account } = await requireAccount(platformPath("provider", "live"));
  if (!account?.displayName) redirect(platformPath("provider"));
  const [{ data, error }, { data: req }] = await Promise.all([
    supabase.rpc("provider_my_reviews"),
    supabase.rpc("my_listing_request"),
  ]);
  if (error) throw new Error(`provider_my_reviews failed: ${error.message}`);
  const p = ((data ?? []) as Listing[]).map((l) => l.provider).find((x) => x.status === "live");
  if (!p) redirect(platformPath("provider"));
  const page = pageShare(p.slug, p.business_name);
  const badge = badgeShare(p.slug, p.business_name);
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
          <p className="lede">Customers can find you and call or WhatsApp you now. Three quick things to get you work:</p>
        </div>
        {proParam === "success" && (
          <p className="form-ok" role="status" data-testid="pro-paid">
            Thanks, your payment went through. Pro switches on as soon as Stripe confirms it, usually within a minute.
          </p>
        )}
        {proParam === "stopped" && (
          <p className="form-alert" role="status" data-testid="pro-stopped">
            No payment was taken, and you&apos;re live on Free. You can start Pro any time from your dashboard.
          </p>
        )}
      </section>

      <section className="auth-card" aria-labelledby="step-avail" data-testid="step-availability">
        <div>
          <p className="eyebrow">Step 1</p>
          <h2 id="step-avail">Are you taking on work?</h2>
          <p className="lede">Customers see this on your page. Change it any time from your dashboard.</p>
        </div>
        <AvailabilityForm action={setMyAvailability} now={availabilityNow(p.availability ?? null)} range={bookedRange()} />
      </section>

      <section className="auth-card" aria-labelledby="step-reviews" data-testid="step-reviews">
        <div>
          <p className="eyebrow">Step 2</p>
          <h2 id="step-reviews">Get your first reviews</h2>
          <p className="lede">
            Send your review link to your last few customers. Reviews are what move you up the list. Ask everyone,
            not just the happy ones: that&apos;s the rule, and it&apos;s what makes your reviews count.
          </p>
        </div>
        <ShareReviewLink {...reviewShare(p.slug, p.business_name)} cardHref={platformPath("provider", "card")} />
      </section>

      <section className="auth-card" aria-labelledby="step-show" data-testid="step-show">
        <div>
          <p className="eyebrow">Step 3</p>
          <h2 id="step-show">Show you&apos;re vouched</h2>
          <p className="lede">
            No website? Your page here is your website. Put the link where customers look for you: your WhatsApp
            Business profile, your Facebook or Instagram bio and, most of all, your Google profile.
          </p>
        </div>
        <ShareReviewLink {...page} label="Your page" testId="page-link" />
        <h3 className="avail-legend">Put it on Google</h3>
        <GoogleProfileLink link={googleProfileLink(p.slug)} />
        <h3 className="avail-legend">Your badge</h3>
        <Button href={badge.png} variant="secondary" download={`${badge.downloadName}.png`}>
          Download your badge
        </Button>
        <p className="hint">
          Post the badge on your WhatsApp Status or social media, or have it printed for your van. The review card in
          step 2 is the printed one for invoices and after a job.
        </p>
        <details className="tick-section" data-testid="have-website">
          <summary>Got a website? Add your badge to it</summary>
          <div className="live-embed">
            <WebsiteBadge {...badge} />
          </div>
        </details>
      </section>

      <section className="auth-card" aria-label="What next">
        <Button href={platformPath("p", p.slug)}>See your page</Button>
        {pro && proParam !== "success" && (
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
