import type { Metadata } from "next";
import { H2, List, PolicyPage } from "@/components/PolicyPage";
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
        Bolton Vouched is run by {owner}, which is the data controller. Contact: {contact}.
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
          "We do not set cookies for public visitors. Cookies are used only for the admin login.",
        ]}
      />

      <H2>Why we use it, and our lawful basis</H2>
      <List
        items={[
          "Publishing a provider's listing: consent. You can withdraw it at any time.",
          "Counting enquiries and keeping the site secure and free of abuse: legitimate interests. We keep this to what is needed and it does not identify visitors by name.",
        ]}
      />

      <H2>Where it is stored</H2>
      <p>Data is stored in the UK, in a Supabase database hosted in London.</p>

      <H2>How long we keep it</H2>
      <p>
        Retention policy (draft, subject to legal review): listing data is kept until the provider withdraws, after which the
        listing is hidden. Contact-event records (the hashed device signature and provider tapped) are kept for up to 12
        months.
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
