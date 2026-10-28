import type { Metadata } from "next";
import { ViewBeacon } from "@/components/ViewBeacon";
import { ChatIcon, LockIcon } from "@/components/auth/icons";
import { GetListedForm } from "@/components/listing/GetListedForm";
import { TRADER_SIGN_IN } from "@/lib/account-intent";
import { BL_DISTRICTS } from "@/lib/districts";
import { formStartToken } from "@/lib/form-timing";
import { pageMetadata } from "@/lib/seo";
import { tradeNames } from "@/lib/trade-names";
import { turnstileSiteKey } from "@/lib/turnstile";

// Rendered per request, like the sign-in page: the Turnstile site key is read at request time and the form carries
// the signed time it was shown. Still cookie-free: proxy.ts doesn't run here, and the action uses no auth client.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Get listed | Bolton Vouched",
  description:
    "Ask to be listed on Bolton Vouched, the free local directory of recommended trades and services in Bolton. Tell us your business, trade and number and we'll be in touch within 2 working days.",
  path: "/get-listed",
});

export default async function GetListedPage() {
  const trades = await tradeNames();
  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="get-listed-title">
        <div>
          <h1 id="get-listed-title">Get listed free</h1>
          <p className="lede">
            We&apos;ll WhatsApp or call you within 2 working days. Nothing goes live until you&apos;ve seen your listing
            and agreed to it.
          </p>
          <p className="lede">
            <a href={TRADER_SIGN_IN}>Log in or join</a> to do it in one form, or <a href="/for-traders">See Pro</a>.
          </p>
        </div>
        <GetListedForm
          started={formStartToken()}
          captchaSiteKey={turnstileSiteKey()}
          trades={trades}
          areas={BL_DISTRICTS}
        />
      </section>
      <ul className="reassure">
        <li>
          <span className="ri">
            <LockIcon />
          </span>
          <span>
            Your details are only used to contact you about a listing. Requests are deleted after 90 days. See the{" "}
            <a href="/privacy">privacy notice</a>.
          </span>
        </li>
        <li>
          <span className="ri">
            <ChatIcon />
          </span>
          <span>
            Nobody pays to rank higher. Pro never changes your place in the list.
          </span>
        </li>
      </ul>
      <ViewBeacon kind="funnel" slug="get-listed" />
    </main>
  );
}
