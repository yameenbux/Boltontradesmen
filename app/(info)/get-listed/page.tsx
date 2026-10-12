import type { Metadata } from "next";
import { ChatIcon, LockIcon } from "@/components/auth/icons";
import { GetListedForm } from "@/components/listing/GetListedForm";
import { BL_DISTRICTS } from "@/lib/districts";
import { listCategoryGroups } from "@/lib/directory";
import { formStartToken } from "@/lib/form-timing";
import { pageMetadata } from "@/lib/seo";
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

/** Category names for the trade field's suggestions. Public data; the form works without them. */
async function tradeNames(): Promise<string[]> {
  try {
    const groups = await listCategoryGroups();
    return [...new Set(groups.flatMap((g) => g.categories.map((c) => c.name)))].sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.error("get-listed: could not load the trade suggestions:", err);
    return [];
  }
}

export default async function GetListedPage() {
  const trades = await tradeNames();
  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="get-listed-title">
        <div>
          <p className="eyebrow">For traders</p>
          <h1 id="get-listed-title">Get listed on Bolton Vouched</h1>
          <p className="lede">
            A basic listing is free and stays free. Tell us who you are and we&apos;ll WhatsApp or call you within 2
            working days. Nothing goes live until you&apos;ve seen your listing and agreed to it.
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
            Nobody pays to rank higher. An optional paid upgrade is coming later; it never affects your place in the
            list.
          </span>
        </li>
      </ul>
    </main>
  );
}
