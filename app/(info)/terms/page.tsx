import type { Metadata } from "next";
import { H2, List, PolicyPage } from "@/components/PolicyPage";
import { COMPANY_LINE } from "@/lib/company";
import { policyIdentity } from "@/lib/policy-config";

export const metadata: Metadata = { title: "Terms | Bolton Vouched" };

export default function TermsPage() {
  const { contact } = policyIdentity();
  return (
    <PolicyPage title="Terms of use">
      <H2>What this site is</H2>
      <p>
        Bolton Vouched is a local directory of recommended local pros in Bolton, where residents leave reviews about the
        people they have used. It is an information service, not a trade body or a marketplace.
      </p>
      <p>{COMPANY_LINE}</p>

      <H2>Reviews are opinions</H2>
      <p>
        Reviews are the opinions of the residents who wrote them. They are not statements by Bolton Vouched, and we do not
        guarantee that any review is complete or accurate.
      </p>

      <H2>Leaving a review</H2>
      <p>
        To leave a review you sign in with your own UK mobile number. You agree to follow the{" "}
        <a href="/review-policy">review policy</a>: write about a job you had done yourself, be honest, and leave out phone
        numbers and other personal details. Fake reviews are not allowed; the{" "}
        <a href="/fake-reviews-policy">fake reviews policy</a> says how we look for them. Providers can reply to reviews
        of their own listing.
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

      <H2>Reporting content</H2>
      <p>
        If you think a review is wrong, unfair or unlawful, tap Report on that review. For anything else on the site, tell
        us at {contact} and say which page it is on.
      </p>
      <List items={["We will review the reports we receive."]} />
    </PolicyPage>
  );
}
