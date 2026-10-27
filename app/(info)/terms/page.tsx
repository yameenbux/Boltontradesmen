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
const TERMS_UPDATED = "25 October 2026";

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

      <H2>Ask Bolton: community rules</H2>
      <p>
        Signed-in residents can ask who to use for a job, and answer by recommending someone listed on the site.
        Questions and answers are public, with your shown name. Questions from accounts that sign in with an email code
        are checked before they go up. A question takes answers for 14 days, then closes.
      </p>
      <List
        items={[
          "Recommend only people you've used, or would honestly recommend. Recommendations aren't reviews and don't change anyone's rating, badges or place in a list.",
          "Traders: don't advertise. You can't recommend your own business; tap “I can help” instead, which shows as you speaking for yourself. Nothing more, please: no prices, offers or links.",
          "No personal attacks, and nothing about someone's private life. A bad experience belongs in a review, where the trader can reply.",
          "No phone numbers, web or email addresses, in questions or answers. People get in touch through the buttons on a trader's page.",
        ]}
      />
      <p>
        We can remove a question or an answer that breaks these rules, and suspend an account that keeps breaking them.
        Tap Report on a question or an answer to tell us about one.
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

      <H2>Your listing</H2>
      <p>
        When you list your business yourself, it goes live straight away and we check it afterwards. We may edit
        listings for accuracy and clarity, such as fixing a spelling, putting you under the right trade or correcting
        your areas, without asking first. If we change the phone number customers reach you on, we&apos;ll email you.
        We can pause or remove a listing that isn&apos;t a real local business or breaks these terms.
      </p>

      <H2>Payment and ranking</H2>
      <p>Payment never affects ranking. No provider can pay to be placed higher or to have a review changed or removed.</p>

      <H2>Pro, for listed traders</H2>
      <p>
        Being listed is free, and stays free. Any listed trader can choose Pro, an optional paid extra, for £10 a
        month or £100 a year. There is no VAT to add. Pro includes:
      </p>
      <List
        items={[
          "“Request a quote” on your page, with a text and an email to you for each request. Requests are for you only: we never pass them to anyone else.",
          "Texts and emails when someone in your areas asks Bolton for your trade (up to 10 texts a day; you can turn them off).",
          "Quotes and invoices you make on the site and send to your customers. You're responsible for what they say, including prices, and for your own records: we delete them after 2 years. Payment goes from your customer to your bank account; it never passes through us.",
          "When you mark an invoice paid, one message from us to your customer asking for an honest review (you can switch this off for any invoice), and up to two payment reminders for an unpaid invoice.",
          "An ID check: we look at a photo of your passport or driving licence, and when we've checked it your page shows “ID checked”.",
          "Up to 6 photos of your own work on your page. They must be your work, and must not show anyone's personal details (including phone numbers) or anyone who hasn't agreed to be in them.",
          "A monthly report of your enquiries on your dashboard.",
        ]}
      />
      <p>
        We may also switch Pro on free for a set time (for example for our first traders). It ends on the date we give
        you, and nothing is charged unless you choose to pay for Pro yourself.
      </p>
      <p>
        Pro never changes where you are listed, your scores or your badges, and there is no way to filter lists by it.
      </p>
      <p>
        Payments are taken by Stripe, our payment processor; we never see your card details. Pro renews automatically
        each month or year until you cancel. You can cancel at any time from Manage billing on your dashboard: Pro then
        stays on until the end of the period you have paid for, and you aren&apos;t charged again. We don&apos;t refund
        part-used periods, except that if we can&apos;t accept your photo ID we refund your Pro payment in full.
      </p>
      <p>
        With Pro, you can also let your customers pay your invoices, and deposits on your quotes, by card. You open a
        Stripe account of your own for this and agree Stripe&apos;s terms with them. Payments go straight to your Stripe
        account: we take no cut, Stripe charges you its own fee on each payment, and refunds, disputes and chargebacks
        are between you, your customer and Stripe.
      </p>
      <p>
        If a payment fails, Stripe tries again for about two weeks, and Pro stays on for up to 14 days from the failed
        payment. If it still isn&apos;t paid, or Pro ends for any other reason, your photos and the ID checked mark
        stop showing. Your listing and its reviews stay as they were, and your photos come back if you restart Pro.
        You can remove your photos at any time. Withdrawing your listing (or our removing it) cancels Pro at the end of
        the period you&apos;ve paid for.
      </p>
      <p>
        We can remove a photo, or end Pro and refund the period not yet used, if it is used to break these terms or the
        review policy. If we change the price, we&apos;ll tell you on your dashboard at least 30 days before it applies,
        and you can cancel before then.
      </p>

      <H2>Work done by providers</H2>
      <p>
        Any work is agreed directly between you and the provider. Bolton Vouched is not a party to that agreement and
        accepts no liability for work done, its quality, its price, or any loss arising from it. Nothing here limits any
        liability that cannot be limited by law.
      </p>

      <H2>Our liability</H2>
      <p>
        Bolton Vouched is free for residents to use. We take care over what we publish, including the checks we show, but we
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
