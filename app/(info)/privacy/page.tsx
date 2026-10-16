import type { Metadata } from "next";
import { H2, List, PolicyPage } from "@/components/PolicyPage";
import { pageMetadata } from "@/lib/seo";
import { COMPANY_LINE } from "@/lib/company";
import { policyIdentity } from "@/lib/policy-config";

export const metadata: Metadata = pageMetadata({
  title: "Privacy notice | Bolton Vouched",
  description:
    "What personal information Bolton Vouched collects, why, where it is stored, how long it is kept and your rights under UK data protection law.",
  path: "/privacy",
});

export default function PrivacyPage() {
  // Same owner/contact configuration as the consent page; throws (failing the build) if unset in production.
  const { owner, contact } = policyIdentity();
  return (
    <PolicyPage title="Privacy notice">
      <p>
        This notice explains what personal information Bolton Vouched collects in its current form, why, and what your
        rights are. It describes only what the site does today.
      </p>

      <H2>Who is responsible</H2>
      <p>
        {COMPANY_LINE} The data controller is {owner}. Contact: {contact}.
      </p>

      <H2>What we collect</H2>
      <p>Local pros listed on the site (providers):</p>
      <List
        items={[
          "Listing information: your name, business name, trade categories, areas covered, and a short bio. This is published on your profile.",
          "Your phone and WhatsApp numbers. These are held privately, are not shown on the page, and are only used behind the Call and WhatsApp buttons.",
          "Consent evidence: when you agreed to be listed (timestamp), the IP address you agreed from, and the version and hash of the consent text you saw.",
          "Checks recorded by the site admin about your business (for example, that a check was made and when).",
        ]}
      />
      <p>Visitors:</p>
      <List
        items={[
          "When you tap Call or WhatsApp on a profile, we record which provider you tapped and a device signature. The signature is a one-way hash (HMAC) of your IP address and browser user agent, so we do not store your IP address or phone number for this. We use these records to count enquiries.",
          "If you only browse, we set no cookies and you need no account.",
        ]}
      />
      <p>People who sign in (to leave a review, or to reply as a provider):</p>
      <List
        items={[
          "Your email address, and if you use Google, your Google account ID and the name and email Google shares with us. Our sign-in provider holds them. We use them to sign you in and to limit sign-in attempts. They are never shown on the site.",
          "If you signed in with a mobile number before October 2026, we keep that number in the same way.",
          "The name you show, like \"Sarah K.\" (your first name and the first letter of your surname), and your postcode district, which is never shown publicly. We don't save the full surname you type in. If you use Google, our sign-in provider holds the name Google shares; we don't show or use it.",
          "Whether you are in the Bolton Tradesmen WhatsApp group, if you add the group code.",
          "Your reviews and replies, which are published with your shown name.",
          "Proof files you choose to add to a review (a photo of an invoice or the finished work). They are kept private, we remove the photo's hidden details (such as location) before storing it, and only the admin sees them. Proof files are deleted 12 months after we check them; a review keeps its Verified job label.",
          "Records of sign-in attempts: the email address or mobile number that was entered, and a scrambled signature of your connection, kept for up to 30 days to stop abuse.",
          "If a sign-in code is asked for but never used, the unfinished account holding that email address is deleted after 24 hours.",
          "A hashed device signature saved with each review, so we can spot fake reviews posted from one device.",
          "Sign-in cookies, which keep you signed in. They are only set once you sign in.",
        ]}
      />

      <H2>Why we use it, and our lawful basis</H2>
      <List
        items={[
          "Publishing a provider's listing: consent. You can withdraw it at any time.",
          "Counting enquiries and keeping the site secure and free of abuse: legitimate interests. We keep this to what is needed and it does not identify visitors by name.",
          "Your account, your reviews and your replies: contract (providing the service you signed up for).",
          "Sign-in attempt records, the sign-in fingerprint we keep after deletion, device signatures and proof files: legitimate interests in preventing fraud and fake reviews.",
        ]}
      />

      <H2>Where it is stored</H2>
      <p>
        Data is stored in the UK, in a Supabase database hosted in London. Supabase also runs our sign-in. Resend sends our
        sign-in emails. Supabase and Resend act for us as processors. If you choose Continue with Google, Google is an
        independent controller for your Google account, under its own terms, and only tells us who you are.
      </p>

      <H2>How long we keep it</H2>
      <p>
        Retention policy (draft, subject to legal review): listing data is kept until the provider withdraws, after which the
        listing is hidden. Contact-event records (the hashed device signature and provider tapped) are kept for up to 12
        months. Sign-in attempt records (with the email address or number entered) are kept for up to 30 days, an unfinished
        account (a code asked for but never used) is deleted after 24 hours, and wrong group code tries are kept for 2
        days. Proof files are deleted 12 months after we check them.
      </p>

      <H2>Deleting your account</H2>
      <p>
        You can delete your account from your account page at any time. Your reviews and replies are taken down and your
        shown name is removed. We keep a scrambled fingerprint of your sign-in (worked out from your email address, Google
        account or mobile number, made with a secret key, and used only to recognise the same sign-in) for 12 months, so
        someone whose review was
        removed for breaking the rules can&apos;t sign up again to review that provider. If you signed in with a mobile
        number, we also keep that number privately for 12 months in case of legal claims. Then we delete them.
      </p>

      <H2>Your rights</H2>
      <p>
        You have the right to access your information, have it corrected, have it erased, object to our use of it, and
        withdraw consent where we rely on it. To use any of these, email {contact}.
      </p>

      <H2>Complaints</H2>
      <p>
        If you are unhappy with how we handle your information you can complain to the Information Commissioner&apos;s Office
        (ICO) at ico.org.uk. We would appreciate the chance to put things right first.
      </p>
    </PolicyPage>
  );
}
