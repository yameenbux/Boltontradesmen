import type { Metadata } from "next";
import { H2, List, PolicyPage } from "@/components/PolicyPage";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "How ratings work | Bolton Vouched",
  description:
    "How Bolton Vouched works out a local pro's figures from residents' reviews: would use again, on time, stuck to price, tidy and the overall quality score.",
  path: "/how-ratings-work",
});

export default function HowRatingsWorkPage() {
  return (
    <PolicyPage title="How ratings work">
      <p>Once residents&apos; reviews are published, profiles show figures worked out from them. Here is what they will mean.</p>

      <H2>The headline figures</H2>
      <List
        items={[
          "Would use again: the percentage of reviewers who said they would use the provider again.",
          "On time: the percentage of reviewers who said the job was on time.",
          "Stuck to price: the percentage of reviewers who said the final price matched what was agreed.",
          "Tidy: the percentage who said the provider left things tidy. This is only shown for trades where it is relevant.",
        ]}
      />

      <H2>The quality score</H2>
      <p>
        Reviewers will also give a quality score out of 5. A provider with only a few reviews could look brilliant or terrible
        by luck, so we pull each score part of the way towards the average for all providers on the register. With more
        reviews the pull gets weaker, and the provider&apos;s own reviews decide the score. This is called shrinking towards
        the average, and it keeps one lucky or unlucky review from deciding where someone ranks.
      </p>

      <H2>Minimum number of reviews</H2>
      <p>No score is shown for a provider with fewer than 3 reviews. Until then they are listed as new.</p>

      <H2>Newer reviews count more</H2>
      <p>Recent work is the best guide, so a review&apos;s influence halves every two years.</p>

      <H2>Payment</H2>
      <p>Payment never affects ranking.</p>
    </PolicyPage>
  );
}
