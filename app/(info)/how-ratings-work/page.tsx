import type { Metadata } from "next";
import { H2, List, PolicyPage } from "@/components/PolicyPage";
import {
  BADGE_MIN_REVIEWS,
  HIGHLY_RATED_MIN_SCORE,
  HIGHLY_RATED_MIN_USE_AGAIN,
  TOP_RATED_MIN_SCORE,
  TOP_RATED_MIN_USE_AGAIN,
} from "@/lib/badges";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "How ratings work | Bolton Vouched",
  description:
    "How Bolton Vouched works out a local pro's figures from residents' reviews: would use again, on time, stuck to price, tidy, the overall quality score and the Top rated and Highly rated badges.",
  path: "/how-ratings-work",
});

export default function HowRatingsWorkPage() {
  return (
    <PolicyPage title="How ratings work">
      <p>Profiles show figures worked out from residents&apos; reviews. Here is what they mean.</p>

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
        reviews the pull gets weaker, and the provider&apos;s own reviews decide the score. This is called shrinking towards
        the average, and it keeps one lucky or unlucky review from deciding where someone ranks.
      </p>

      <H2>Minimum number of reviews</H2>
      <p>No score is shown for a provider with fewer than 3 reviews. Until then they are listed as new.</p>

      <H2>How lists are ordered</H2>
      <p>
        In each trade, providers with 3 or more reviews come first, highest quality score first. If two have the same
        score, the one with more reviews comes first, then the one with the most recent review. Providers with fewer than
        3 reviews are listed after them under &ldquo;New on Bolton Vouched&rdquo;, newest listing first.
      </p>
      <p>
        Would use again, On time, Stuck to price and Tidy are shown on each listing to help you choose, but they
        don&apos;t decide the order.
      </p>
      <p>
        &ldquo;Taking on work&rdquo; and &ldquo;Booked up until&rdquo; are set by the trader, run out by themselves
        (after 14 days, or on the date given) and don&apos;t change the order.
      </p>
      <p>
        Recommendations in answer to questions on Ask Bolton aren&apos;t reviews: they never change anyone&apos;s scores,
        badges or place in a list.
      </p>

      <H2>Newer reviews count more</H2>
      <p>Recent work is the best guide, so a review&apos;s influence halves every two years.</p>

      <H2>Which reviews count</H2>
      <p>
        Every review comes from someone who signed in with Google or an email code. Reviews from email-code sign-ins count only
        after we&apos;ve checked them. Published reviews count, and so do reviews
        marked &ldquo;Under check&rdquo; while we look at them. A review the admin removes stops counting. The{" "}
        <a href="/review-policy">review policy</a> and <a href="/fake-reviews-policy">fake reviews policy</a> explain the
        rules.
      </p>

      <H2>Badges</H2>
      <p>
        A provider with {BADGE_MIN_REVIEWS} or more reviews that count can earn one badge, shown on their profile and in
        lists:
      </p>
      <List
        items={[
          `Top rated: a quality score of ${TOP_RATED_MIN_SCORE.toFixed(1)} or more and ${TOP_RATED_MIN_USE_AGAIN}% or more would use them again.`,
          `Highly rated: a quality score of ${HIGHLY_RATED_MIN_SCORE.toFixed(1)} or more and ${HIGHLY_RATED_MIN_USE_AGAIN}% or more would use them again.`,
        ]}
      />
      <p>
        We use the quality score and the would use again figure exactly as the profile shows them. A provider who meets
        both gets Top rated only. Badges are earned from residents&apos; reviews alone, and they update by themselves as
        reviews come in, so a provider can lose one as well as gain one. Nobody can buy a badge or pay for one, and
        badges don&apos;t change the order of a list.
      </p>

      <H2>Payment</H2>
      <p>Payment never affects ranking or badges.</p>
      <p>
        Traders can pay for an optional extra: we check their photo ID, they can show up to 6 photos of their work, and
        they get a monthly report of their enquiries. It doesn&apos;t change the order of any list, the scores or the
        badges, and there&apos;s no way to filter lists by it. A profile shows &ldquo;ID checked&rdquo; when we&apos;ve
        seen the trader&apos;s photo ID; it says nothing about the quality of their work, which only reviews show.
      </p>
    </PolicyPage>
  );
}
