import type { Metadata } from "next";
import { H2, List, PolicyPage } from "@/components/PolicyPage";
import { CONTACT_EMAIL, MAILTO, SUPPORT_WHATSAPP_DISPLAY, WHATSAPP } from "@/components/site/content";

export const metadata: Metadata = { title: "Review policy | Bolton Vouched" };

export default function ReviewPolicyPage() {
  return (
    <PolicyPage title="Review policy">
      <p>
        Reviews on Bolton Vouched help people in Bolton pick someone good. This page says who can leave one, what to
        write, and when a review can come down.
      </p>

      <H2>Who can leave a review</H2>
      <List
        items={[
          "Anyone who has had work done by a provider on the site, and signs in with their own UK mobile number. Internet and virtual numbers can't sign in.",
          "One review per provider per person. You can edit it instead of posting another.",
          "Providers can't review their own listing, or anyone who works in the same trade as them.",
          "A new account can post one review in its first 24 hours.",
        ]}
      />

      <H2>What to write</H2>
      <List
        items={[
          "Your own experience of a job you had done: the month it was done, roughly what it cost, whether they turned up and stuck to the price, the quality, and whether you'd use them again.",
          "Be honest. Mixed jobs are useful too.",
          "Leave out phone numbers and other personal details. A comment with a phone number in it can't be posted.",
          "Nothing abusive, and nothing you know to be untrue.",
        ]}
      />

      <H2>Reviews go live straight away</H2>
      <p>
        We don&apos;t approve reviews before they show. When you post, you see &ldquo;Published&rdquo;, or
        &ldquo;Published, under a quick check&rdquo; if our automatic checks want a closer look (for example, several
        reviews for one provider in two days). A review under a quick check stays on the page with an &ldquo;Under
        check&rdquo; label and still counts while we look. The <a href="/fake-reviews-policy">fake reviews policy</a>{" "}
        lists the checks.
      </p>

      <H2>Editing</H2>
      <p>You can edit your review for 14 days after posting it. Edits go through the same checks.</p>

      <H2>Replies</H2>
      <p>
        The provider can reply once to each review of their listing, and edit the reply for 14 days. Replies follow the
        same rules: no phone numbers, nothing abusive.
      </p>

      <H2>Proof of the job</H2>
      <p>
        You can add a photo of the invoice or the finished work, or a PDF. It&apos;s optional, it&apos;s kept private, and
        only the admin sees it. We remove a photo&apos;s hidden details, such as where it was taken, before we store it.
        If the admin accepts it, your review shows a &ldquo;Verified job&rdquo; badge.
      </p>

      <H2>Reporting a review</H2>
      <p>
        Every review has a Report link. Sign in, tell us what&apos;s wrong, and the admin looks at it. A report doesn&apos;t
        change a review on its own.
      </p>

      <H2>When a review comes down</H2>
      <p>Reviews are only removed for a reason, and the reason is kept in our audit log. We remove a review that is:</p>
      <List
        items={[
          "fake, or posted by someone who isn't a real customer;",
          "abusive or threatening;",
          "unlawful, for example defamatory;",
          "sharing someone's personal details.",
        ]}
      />
      <p>
        We never remove a review because a provider disagrees with it. They can reply instead. Reviews are never deleted
        from our records, so a removal can always be checked. If you delete your account, your reviews come down.
      </p>

      <H2>Questions</H2>
      <p>
        Email <a href={MAILTO}>{CONTACT_EMAIL}</a> or message us on WhatsApp at{" "}
        <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">
          {SUPPORT_WHATSAPP_DISPLAY}
        </a>
        .
      </p>
    </PolicyPage>
  );
}
