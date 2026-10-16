import type { Metadata } from "next";
import { H2, List, PolicyPage } from "@/components/PolicyPage";
import { OPERATOR, pageMetadata } from "@/lib/seo";
import { COMPANY_LINE, TRADING_NAME } from "@/lib/company";
import { policyIdentity } from "@/lib/policy-config";

export const metadata: Metadata = pageMetadata({
  title: "Terms | Bolton Vouched",
  description:
    "The terms of use for Bolton Vouched, the local directory of recommended trades and services in Bolton: what the site is, how listings and reviews work and who runs it.",
  path: "/terms",
});

// Shown on the page; change it whenever the terms change.
const TERMS_UPDATED = "12 October 2026";

export default function TermsPage() {
  const { contact } = policyIdentity();
  return (
    <PolicyPage title="Terms of use">
      <p>Last updated: {TERMS_UPDATED}.</p>

      <H2>What this site is</H2>
      <p>
        Bolton Vouched is a local directory of recommended local pros in Bolton, where residents leave reviews about the
        people they have used. It is an information service, not a trade body or a marketplace.
      </p>
      <p>{COMPANY_LINE}</p>

      <H2>Who we are</H2>
      <p>
        Bolton Vouched is run by {TRADING_NAME}, a trading name of {OPERATOR.legalName}, a company registered in England
        and Wales with company number {OPERATOR.companyNumber}. In these terms, &ldquo;we&rdquo; and &ldquo;us&rdquo;
        means {OPERATOR.legalName}. You can contact us at {contact}.
      </p>

      <H2>Reviews are opinions</H2>
      <p>
        Reviews are the opinions of the residents who wrote them. They are not statements by Bolton Vouched, and we do not
        guarantee that any review is complete or accurate.
      </p>

      <H2>Leaving a review</H2>
      <p>
        To leave a review you sign in with your Google account or a code sent to your email address. You agree to follow the{" "}
        <a href="/review-policy">review policy</a>: write about a job you had done yourself, be honest, and leave out phone
        numbers and other personal details. Fake reviews are not allowed; the{" "}
        <a href="/fake-reviews-policy">fake reviews policy</a> says how we look for them. Providers can reply to reviews
        of their own listing.
      </p>

      <H2>Accounts and suspension</H2>
      <p>
        You are responsible for what is posted from your account. We can remove a review or reply, or suspend or close an
        account, if it breaks the <a href="/review-policy">review policy</a> or these terms: for example a fake review, a
        review of your own business or a competitor&apos;s, abuse, or someone else&apos;s personal details. Where we can,
        we will tell you why. You can delete your account at any time from your account page.
      </p>

      <H2>Providers are independent</H2>
      <p>
        Providers listed on the site are not employed, endorsed or guaranteed by Bolton Vouched. A listing is not a
        recommendation that a provider is right for your job. Please get quotes and check details yourself.
      </p>

      <H2>Payment and ranking</H2>
      <p>Payment never affects ranking. No provider can pay to be placed higher or to have a review changed or removed.</p>

      <H2>Work done by providers</H2>
      <p>
        Any work is agreed directly between you and the provider. Bolton Vouched is not a party to that agreement and
        accepts no liability for work done, its quality, its price, or any loss arising from it. Nothing here limits any
        liability that cannot be limited by law.
      </p>

      <H2>Our liability</H2>
      <p>
        Bolton Vouched is a free directory. We take care over what we publish, including the checks we show, but we
        don&apos;t promise the site will always be available or free of mistakes. The contract for any job is between you
        and the provider, and we are not responsible for what either of you does under it.
      </p>
      <p>
        Nothing in these terms excludes or limits our liability where the law doesn&apos;t allow it, including for death
        or personal injury caused by our negligence, or for fraud. If you use the site as a consumer, nothing in these
        terms affects your legal rights.
      </p>

      <H2>Reporting content</H2>
      <p>
        If you think a review is wrong, unfair or unlawful, tap Report on that review (you need to be signed in), or email
        us at {contact} and say which review it is. For anything else on the site, tell us at {contact} and say which page
        it is on.
      </p>
      <List items={["We will review the reports we receive."]} />

      <H2>Changes to these terms</H2>
      <p>
        We may update these terms, for example when the site changes or the law does. The date at the top of this page
        shows when they last changed, and we&apos;ll say on the site when we make a change that matters.
      </p>

      <H2>Law and courts</H2>
      <p>
        These terms are governed by the law of England and Wales, and disputes go to the courts of England and Wales. If
        you live in Scotland or Northern Ireland, you can also bring proceedings in your local courts.
      </p>
    </PolicyPage>
  );
}
