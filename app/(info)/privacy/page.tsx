import type { Metadata } from "next";
import { H2, List, PolicyPage } from "@/components/PolicyPage";
import { COMPANY_LINE } from "@/lib/company";
import { policyIdentity } from "@/lib/policy-config";

export const metadata: Metadata = { title: "Privacy notice | Bolton Vouched" };

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
          "Your mobile number. It is held by our sign-in provider and used only to send your sign-in codes. Before we send a code we check the number with Twilio, to block internet and virtual numbers. It is never shown on the site.",
          "The name you show, like \"Sarah K.\" (your first name and the first letter of your surname; we do not keep your full surname), and your postcode district, which is never shown publicly.",
          "Whether you are in the Bolton Tradesmen WhatsApp group, if you add the group code.",
          "Your reviews and replies, which are published with your shown name.",
          "Proof files you choose to add to a review (a photo of an invoice or the finished work). They are kept private, we remove the photo's hidden details (such as location) before storing it, and only the admin sees them.",
          "Records of sign-in attempts: the number and a scrambled signature of your connection, kept for 30 days to stop abuse.",
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
          "Checking numbers, sign-in attempt records, device signatures and proof files: legitimate interests in preventing fraud and fake reviews.",
        ]}
      />

      <H2>Where it is stored</H2>
      <p>
        Data is stored in the UK, in a Supabase database hosted in London. Supabase also runs our sign-in. Twilio sends
        sign-in codes and checks the type of a mobile number. Both act for us as processors.
      </p>

      <H2>How long we keep it</H2>
      <p>
        Retention policy (draft, subject to legal review): listing data is kept until the provider withdraws, after which the
        listing is hidden. Contact-event records (the hashed device signature and provider tapped) are kept for up to 12
        months. Sign-in attempt records are kept for 30 days.
      </p>

      <H2>Deleting your account</H2>
      <p>
        You can delete your account from your account page at any time. Your reviews and replies are taken down and your
        shown name is removed. We keep your mobile number privately for 12 months in case of legal claims about your
        reviews, and then delete it.
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
