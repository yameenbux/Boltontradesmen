import type { Metadata } from "next";
import { H2, List, PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "How ratings work | Bolton Vouched" };

export default function HowRatingsWorkPage() {
  return (
    <PolicyPage title="How ratings work">
      <p>Every profile shows figures worked out from residents' reviews. Here is what they mean.</p>

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
        Reviewers also give a quality score out of 5. A provider with only a few reviews could look brilliant or terrible
        by luck, so we pull each score part of the way towards the average for all providers on the register. With more
        reviews the pull gets weaker, and the provider's own reviews decide the score. This is called shrinking towards
        the average, and it keeps one lucky or unlucky review from deciding where someone ranks.
      </p>

      <H2>Minimum number of reviews</H2>
      <p>No score is shown for a provider with fewer than 3 reviews. Until then they are listed as new.</p>

      <H2>Newer reviews count more</H2>
      <p>Recent work is the best guide, so a review's influence halves every two years.</p>

      <H2>Payment</H2>
      <p>Payment never affects ranking.</p>
    </PolicyPage>
  );
}
