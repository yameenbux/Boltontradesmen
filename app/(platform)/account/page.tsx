import type { Metadata } from "next";
import { ChevronRight, ShopIcon } from "@/components/auth/icons";
import { DeleteAccountForm } from "@/components/account/DeleteAccountForm";
import { MyReviews } from "@/components/account/MyReviews";
import { Button } from "@/components/ui/Button";
import { TRADER_START } from "@/lib/account-intent";
import { type MyReviewRow, SIGN_IN_RETENTION_TEXT } from "@/lib/account-text";
import { requireMember } from "@/lib/auth";
import { OTHER_DISTRICT } from "@/lib/districts";
import { platformPath } from "@/lib/paths";
import { signOutResident } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your account | Bolton Vouched",
  description: "Your name, your reviews and your account settings on Bolton Vouched.",
  robots: { index: false },
};

function initialsOf(name: string): string {
  const [first, last] = name.split(" ");
  return (Array.from(first)[0] + (last ? Array.from(last)[0] : "")).toLocaleUpperCase("en-GB");
}

export default async function AccountPage() {
  const { supabase, account } = await requireMember("/");
  const name = account.displayName ?? "";
  const { data, error } = await supabase.rpc("my_reviews");
  if (error) throw new Error(`my_reviews failed: ${error.message}`);
  const reviews = (data ?? []) as MyReviewRow[];
  const area = account.district === OTHER_DISTRICT ? "Outside Bolton" : account.district;
  const listings = account.providers;

  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="account-title">
        <p className="eyebrow">Your account</p>
        <div className="who-card">
          <span className="avatar" aria-hidden="true">
            {initialsOf(name)}
          </span>
          <div>
            <h1 id="account-title" className="name">
              <span className="signed">Signed in as</span> {name}
            </h1>
            {area && <p className="area">Area: {area}</p>}
          </div>
        </div>
      </section>

      {listings.length > 0 ? (
        <a href={platformPath("provider")} className="account-link press lift">
          <span className="ai">
            <ShopIcon />
          </span>
          <span>
            <b>Your listing</b>
            <small>{listings.map((l) => l.businessName).join(", ")}: see and reply to your reviews</small>
          </span>
          <ChevronRight />
        </a>
      ) : (
        <a href={TRADER_START} className="account-link press lift" data-testid="account-trader-start">
          <span className="ai">
            <ShopIcon />
          </span>
          <span>
            <b>Are you a trader?</b>
            <small>Get your business listed for free, or link the listing you already have</small>
          </span>
          <ChevronRight />
        </a>
      )}

      <MyReviews reviews={reviews} />

      <form action={signOutResident}>
        <Button type="submit" variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>

      <section className="auth-card" aria-labelledby="delete-title">
        <div>
          <h2 id="delete-title">Delete account</h2>
          <p className="lede">
            Your reviews, replies, questions and answers are taken down and your name is removed. {SIGN_IN_RETENTION_TEXT} The{" "}
            <a href="/privacy">privacy notice</a> has the detail. Any listing of yours stays up.
          </p>
        </div>
        <details className="danger-zone">
          <summary>I want to delete my account</summary>
          <DeleteAccountForm />
        </details>
      </section>
    </main>
  );
}
