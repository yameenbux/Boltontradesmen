import { ChatIcon, ChevronRight, ShopIcon } from "@/components/auth/icons";
import { GET_LISTED, SUPPORT_WHATSAPP_DISPLAY, whatsappTicket } from "@/components/site/content";
import { Button } from "@/components/ui/Button";
import { platformPath } from "@/lib/paths";

export const LINK_ME_WHATSAPP = whatsappTicket(
  "Hi, I'm already listed on Bolton Vouched. Please send me the link to connect my listing to my account. Business name: …",
);

/**
 * The trader start, for a signed-in account with no listing linked yet: get listed (free), or have an existing
 * listing linked (we send a one-time trader link). Replaces a bare "No listing found".
 */
export function TraderStart() {
  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="provider-title">
        <div>
          <p className="eyebrow">For traders</p>
          <h1 id="provider-title">Let&apos;s get your business on Bolton Vouched</h1>
          <p className="lede">
            You&apos;re signed in, but no listing is linked to this account yet. Choose the one that fits you.
          </p>
          <p className="lede">
            Want job requests by text, and quotes and invoices from your phone? <a href="/for-traders">See Pro</a>.
          </p>
        </div>
      </section>

      <a href={GET_LISTED} className="account-link press lift" data-testid="trader-start-get-listed">
        <span className="ai">
          <ShopIcon />
        </span>
        <span>
          <b>I&apos;m not listed yet</b>
          <small>Get listed for free. Tell us your trade and areas and we&apos;ll be in touch within 2 working days.</small>
        </span>
        <ChevronRight />
      </a>

      <a href={LINK_ME_WHATSAPP} className="account-link press lift" data-testid="trader-start-link">
        <span className="ai">
          <ChatIcon />
        </span>
        <span>
          <b>I&apos;m already listed</b>
          <small>
            WhatsApp us on {SUPPORT_WHATSAPP_DISPLAY} and we&apos;ll send a link that connects your listing to this
            account.
          </small>
        </span>
        <ChevronRight />
      </a>

      <Button href={platformPath()} variant="secondary">
        I&apos;m not a trader: find a trader instead
      </Button>
    </main>
  );
}
