import type { Metadata } from "next";
import { H2, List, PolicyPage } from "@/components/PolicyPage";
import { consentStatement } from "@/lib/consent-text";

export const metadata: Metadata = { title: "Terms | Bolton Vouched" };

export default function TermsPage() {
  const c = consentStatement();
  const contact = c?.contact ?? "the contact details on this site (not yet configured)";
  return (
    <PolicyPage title="Terms of use">
      <H2>What this site is</H2>
      <p>
        Bolton Vouched is a local directory of recommended local pros in Bolton, with reviews from residents who have used
        them. It is an information service, not a trade body or a marketplace.
      </p>

      <H2>Reviews are opinions</H2>
      <p>
        Reviews are the opinions of the residents who wrote them. They are not statements by Bolton Vouched, and we do not
        guarantee that any review is complete or accurate.
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
      <p>If you think something on the site is wrong, unfair or unlawful, tell us at {contact} and say which page it is on.</p>
      <List items={["We look at every report.", "We may hide content while we check it."]} />
    </PolicyPage>
  );
}
