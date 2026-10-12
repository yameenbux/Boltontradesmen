import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { H2, List, PolicyPage } from "@/components/PolicyPage";
import { CONTACT_EMAIL, MAILTO, SUPPORT_WHATSAPP_DISPLAY, WHATSAPP } from "@/components/site/content";

export const metadata: Metadata = pageMetadata({
  title: "Fake reviews policy | Bolton Vouched",
  description:
    "How Bolton Vouched works against fake reviews: we don't pay for reviews, the rules when you post, the automatic checks, what happens to a flagged review and how to report one.",
  path: "/fake-reviews-policy",
});

const RISKS: { risk: string; control: string }[] = [
  {
    risk: "Friends and family reviewing a provider",
    control:
      "Providers signed in with the number on their listing can't review themselves; one review per person per provider; checks for reviews from one device, for accounts made together, and for a brand-new account's lone 5-star review; Report on every review.",
  },
  {
    risk: "Competitors posting bad reviews",
    control:
      "Providers signed in with the number on their listing can't review anyone in the same trade; the checks treat a burst of bad reviews the same as a burst of good ones; reviews come down only for a logged reason.",
  },
  {
    risk: "Review swaps between providers",
    control:
      "Providers in the same trade can't review each other when they sign in with the number on their listing; the admin can see who reviewed whom and remove swapped reviews.",
  },
  {
    risk: "Bulk or throwaway accounts",
    control:
      "Sign-in needs a real UK mobile number (internet and virtual numbers are refused); one account per number; limits on sign-in codes per number and per connection; a new account can post one review in its first day; accounts made within minutes of each other are flagged.",
  },
];

export default function FakeReviewsPolicyPage() {
  return (
    <PolicyPage title="Fake reviews policy">
      <p>
        The Digital Markets, Competition and Consumers Act 2024 bans fake reviews, and bans hiding that a review was paid
        for or rewarded. This page says what we do to keep them off Bolton Vouched.
      </p>

      <H2>We don&apos;t pay for reviews</H2>
      <p>
        We never offer money, discounts or anything else for a review, and providers may not either. Providers can ask
        their customers to leave an honest review, nothing more.
      </p>

      <H2>Rules when you post</H2>
      <List
        items={[
          "Every reviewer signs in with their own UK mobile number. Internet and virtual numbers are refused, and each number can have one account.",
          "One review per provider per person.",
          "Providers can't review their own listing, or anyone who works in the same trade, when they sign in with the number on their listing.",
          "A new account can post one review in its first 24 hours.",
        ]}
      />

      <H2>Automatic checks</H2>
      <p>Every new or edited review runs through four checks. A review that trips one is marked &ldquo;Under check&rdquo;:</p>
      <List
        items={[
          "Three or more reviews for one provider within 48 hours.",
          "Three or more reviewers of one provider whose accounts were made within 10 minutes of each other.",
          "Reviews of one provider posted or edited from the same device by different people.",
          "A brand-new account (under a day old) whose only review is 5 stars, or 1 star.",
        ]}
      />
      <p>The checks treat good and bad reviews alike: a burst of 1-star reviews is checked just like a burst of 5-star ones.</p>

      <H2>What happens to a flagged review</H2>
      <p>
        It stays on the page with an &ldquo;Under check&rdquo; label and still counts while the admin looks. The admin then
        clears it, or removes it with a written reason. Every decision is kept in an audit log, and reviews are never
        deleted from our records.
      </p>

      <H2>Reporting a fake review</H2>
      <p>
        Tap Report on the review, or email <a href={MAILTO}>{CONTACT_EMAIL}</a> or message us on WhatsApp at{" "}
        <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">
          {SUPPORT_WHATSAPP_DISPLAY}
        </a>
        . Reports go to the admin and never change a review on their own.
      </p>

      <H2>Risk assessment: 12 October 2026</H2>
      <p>The main ways fake reviews could reach the site, and what stops each one:</p>
      <ul>
        {RISKS.map((r) => (
          <li key={r.risk}>
            <b>{r.risk}.</b> {r.control}
          </li>
        ))}
      </ul>
      <p>We look at this assessment again whenever the rules change, and at least once a year.</p>
    </PolicyPage>
  );
}
