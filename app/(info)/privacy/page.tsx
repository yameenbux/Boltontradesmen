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
      <p>Traders who choose Pro, the optional paid extra:</p>
      <List
        items={[
          "Payment: Stripe, our payment processor, takes your payment and holds your card details; we never see them. We keep the references Stripe gives us for you and your subscription, which plan you're on, its status and when it renews or ends.",
          "Your ID check: a photo of your passport or driving licence, and, if you choose, your insurance certificate or trade accreditations. We use them only to check who you are and what you're covered for. They are stored privately, we remove photos' hidden details (such as location) first, and only the site admin sees them. We delete each file 30 days after we've decided on it and keep only the decision: whether it was accepted, when, and why not if it wasn't. While Pro is on, your page shows \"ID checked\".",
          "Card payments, if you turn them on: you open a Stripe account of your own, and Stripe collects the details it needs from you directly. We keep only its account reference and whether it can take payments. Your customers pay you through Stripe; we see which quote or invoice was paid and how much, never their card details.",
          "Work photos you add are published on your page while Pro is on. We remove their hidden details (such as location) before publishing them. You can delete them at any time from your dashboard, Pro or not.",
        ]}
      />
      <p>Visitors:</p>
      <List
        items={[
          "When you tap Call or WhatsApp on a profile, we record which provider you tapped and a device signature. The signature is a one-way hash (HMAC) of your IP address and browser user agent, so we do not store your IP address or phone number for this. If you are signed in, we also record your account, so a trader's own taps (and the admin's) are not counted as enquiries. We use these records to count enquiries.",
          "What you type into the home page search, with nothing that links it to you: we don't record your IP address, a device signature or an account with it. Digits are masked and it's cut to 40 characters. We use it to see which trades people look for and how often search finds nothing.",
          "If you only browse, we set no cookies and you need no account.",
          "If you choose the light or dark look, that choice is saved in your browser's own storage (local storage), not sent to us.",
        ]}
      />
      <p>People who ask a trader for a quote (Request a quote, on a Pro trader&apos;s page):</p>
      <List
        items={[
          "Your name, your phone number, your email address if you add it, your postcode district and the job you describe.",
          "A scrambled signature of your connection (a keyed hash, not your IP address), to limit how many requests one connection can send.",
          "Only that trader sees them, to reply about the job; we send them to the trader by text and email. Requests are deleted after 180 days.",
        ]}
      />
      <p>Customers of Pro traders (quotes and invoices a trader makes on Bolton Vouched):</p>
      <List
        items={[
          "What the trader enters: your name, and your mobile and email if they add them, and the job, prices and dates. The trader decides what to send; we keep it so they can send it and you can open it from the link.",
          "Whether you accepted a quote, and when an invoice was marked paid.",
          "We text or email you only about that quote or invoice: a copy if the trader asks us to, up to two payment reminders after an invoice is due, and once it's paid, one request for an honest review of the trader (never more than one in 90 days per trader). The trader can turn the review request off.",
          "Quotes and invoices are deleted 2 years after they're made.",
        ]}
      />
      <p>Pro traders&apos; bank details: the name, sort code and account number printed on your invoices. Only you, and anyone with one of your invoice links, can see them.</p>
      <p>Pro traders&apos; alerts:</p>
      <List
        items={[
          "The mobile number and email address your alerts go to, which alerts are on, and a record of each alert we send (where to, when, and whether it went), kept for 180 days to stop duplicates and keep to the daily limits.",
        ]}
      />
      <p>Traders who ask to be listed (the Get listed form):</p>
      <List
        items={[
          "Your business name, your name, your trade, the areas you cover, your phone number, and your email address and message if you add them.",
          "A scrambled signature of your connection (a keyed hash, not your IP address), to limit how many requests one connection can send.",
          "We use these only to contact you about a listing.",
        ]}
      />
      <p>People who sign in (to leave a review, to ask or answer a question, or to reply as a provider):</p>
      <List
        items={[
          "Your email address, and if you use Google, your Google account ID and the name and email Google shares with us. Our sign-in provider holds them. We use them to sign you in and to limit sign-in attempts. They are never shown on the site.",
          "If you signed in with a mobile number before October 2026, we keep that number in the same way.",
          "The name you show, like \"Sarah K.\" (your first name and the first letter of your surname), and your postcode district, which is never shown publicly. We don't save the full surname you type in. If you use Google, our sign-in provider holds the name Google shares; we don't show or use it.",
          "Your reviews and replies, which are published with your shown name.",
          "Questions you ask on Ask Bolton (with the trade and the postcode district you choose) and your answers to other people's questions, which are published with your shown name. A trader's \"I can help\" is published under their business name. They stay up until you delete your account, when they're taken down.",
          "Proof files you choose to add to a review (a photo of an invoice or the finished work). They are kept private, we remove the photo's hidden details (such as location) before storing it, and only the admin sees them. Proof files are deleted 12 months after we check them; a review keeps its Verified job label.",
          "Records of sign-in attempts: the email address or mobile number that was entered, and a scrambled signature of your connection, kept for up to 30 days to stop abuse.",
          "If a sign-in code is asked for but never used, the unfinished account holding that email address is deleted after 24 hours.",
          "A hashed device signature saved with each review, so we can spot fake reviews posted from one device.",
          "Sign-in cookies, which keep you signed in. They are only set once you sign in.",
          "A review you've started writing is saved in your browser's local storage until you post it, so it isn't lost. It isn't sent to us until you post.",
        ]}
      />
      <p>
        The <a href="/cookies">cookies page</a> lists the sign-in cookies and what&apos;s saved on your device, and
        explains why there&apos;s no cookie banner.
      </p>

      <H2>Why we use it, and our lawful basis</H2>
      <List
        items={[
          "Publishing a provider's listing: consent. You can withdraw it at any time.",
          "Pro (payment, the ID check and work photos): contract, providing the service you paid for.",
          "Counting enquiries and keeping the site secure and free of abuse: legitimate interests. We keep this to what is needed and it does not identify visitors by name.",
          "Your account, your reviews, your replies, and your questions and answers: contract (providing the service you signed up for).",
          "Sign-in attempt records, the sign-in fingerprint we keep after deletion, device signatures and proof files: legitimate interests in preventing fraud and fake reviews.",
          "Quotes, invoices and the messages about them: legitimate interests, for the trader and their customer to agree and settle a job. The review request after payment: legitimate interests in honest local reviews, and the trader can switch it off.",
          "A request for a quote: legitimate interests in passing your request to the trader you chose, as you asked. Pro traders' alerts: contract, providing the service.",
          "A request to be listed: legitimate interests in answering it, and taking the steps you asked for before you agree to be listed. The connection signature: legitimate interests in stopping spam.",
          "The security check on forms (Cloudflare Turnstile), counting page views and the home page search words: legitimate interests in keeping the site secure, knowing which pages are used and which trades are missing.",
        ]}
      />

      <H2>Where it is stored</H2>
      <p>
        Data is stored in the UK, in a Supabase database hosted in London. Supabase also runs our sign-in. Resend sends our
        sign-in emails and Pro traders&apos; alert emails. Twilio sends Pro traders&apos; alert texts. Cloudflare runs the security check (Turnstile) on the sign-in page, the admin login, the Get
        listed form and the Request a quote form, which may look at signals from your device and browser, and, if it&apos;s switched on, counts page
        views without cookies or a profile of you (Cloudflare Web Analytics). Stripe takes Pro payments. Supabase, Resend, Twilio, Cloudflare and Stripe act for
        us as processors (Stripe also has its own legal duties for payments, such as preventing fraud, under its own
        privacy policy). Render hosts the website; the home page search words are kept only in its server logs, which are deleted automatically. If you choose Continue with Google, Google is an
        independent controller for your Google account, under its own terms, and only tells us who you are.
      </p>

      <H2>How long we keep it</H2>
      <p>
        Retention policy (draft, subject to legal review): listing data is kept until the provider withdraws, after which the
        listing is hidden. Contact-event records (the hashed device signature and provider tapped) are kept for up to 12
        months. Sign-in attempt records (with the email address or number entered) are kept for up to 30 days, and an
        unfinished account (a code asked for but never used) is deleted after 24 hours. Proof files are deleted 12 months
        after we check them. A request to be listed is deleted 90 days after you send it; if you&apos;re listed, the details the listing needs are kept with it instead. ID documents sent for Pro are deleted 30 days after we decide on them; the decision is kept with the listing. Pro subscription records are kept with the listing, and Stripe keeps payment records as the law on accounts requires.
      </p>

      <H2>Deleting your account</H2>
      <p>
        You can delete your account from your account page at any time. Your reviews, replies, questions and answers are
        taken down and your shown name is removed. We keep a scrambled fingerprint of your sign-in (worked out from your email address, Google
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
