import type { Metadata } from "next";
import { LockIcon } from "@/components/auth/icons";
import { WebsiteCheckForm } from "@/components/listing/WebsiteCheckForm";
import { formStartToken } from "@/lib/form-timing";
import { pageMetadata } from "@/lib/seo";
import { turnstileSiteKey } from "@/lib/turnstile";

// The free website check from YSB Designs, offered to traders on the For traders page. Rendered per request like the
// Get listed form (the Turnstile key and the signed start time); still cookie-free.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Free website check for Bolton traders | Bolton Vouched",
  description:
    "A free check of your website and Google profile from YSB Designs, the team behind Bolton Vouched: what's costing you calls, and what to fix first. No obligation.",
  path: "/website-check",
});

export default function WebsiteCheckPage() {
  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="website-check-title">
        <div>
          <h1 id="website-check-title">Free website check</h1>
          <p className="lede">
            YSB Designs, the team behind Bolton Vouched, will look at your website and Google profile and tell you
            what&apos;s costing you calls and what to fix first. Free, and no obligation.
          </p>
          <p className="lede">No website yet? Ask anyway: we&apos;ll tell you where to start.</p>
        </div>
        <WebsiteCheckForm started={formStartToken()} captchaSiteKey={turnstileSiteKey()} />
      </section>
      <ul className="reassure">
        <li>
          <span className="ri">
            <LockIcon />
          </span>
          <span>
            We only use your details to do your check and talk to you about it. Nothing is added to the directory. See
            the <a href="/privacy">privacy notice</a>.
          </span>
        </li>
      </ul>
    </main>
  );
}
