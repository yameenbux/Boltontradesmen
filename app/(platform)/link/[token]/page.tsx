import type { Metadata } from "next";
import { AlertIcon } from "@/components/auth/icons";
import { CONTACT_EMAIL, MAILTO, SUPPORT_WHATSAPP_DISPLAY, WHATSAPP } from "@/components/site/content";
import { Button } from "@/components/ui/Button";
import { requireMember } from "@/lib/auth";
import { platformPath } from "@/lib/paths";
import { isTraderLinkError, TOKEN_PATTERN, TRADER_LINK_ERRORS, type TraderLinkState } from "@/lib/trader-link";
import { ClaimForm } from "./ClaimForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Link your listing | Bolton Vouched", robots: { index: false } };

type Preview = { state: string; business_name?: string };

export default async function TraderLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase } = await requireMember(platformPath("link", token));

  let state: TraderLinkState = "link_invalid";
  let business: string | null = null;
  if (TOKEN_PATTERN.test(token)) {
    const { data, error } = await supabase.rpc("trader_link_preview", { p_token: token });
    if (error) throw new Error(`trader_link_preview failed: ${error.message}`);
    const preview = data as Preview | null;
    if (preview?.state === "ok" || (preview && isTraderLinkError(preview.state))) state = preview.state as TraderLinkState;
    business = preview?.business_name ?? null;
  }

  if (state === "ok" && business) {
    return (
      <main className="auth">
        <section className="auth-card" aria-labelledby="link-title">
          <div>
            <p className="eyebrow">Your listing</p>
            <h1 id="link-title">Link {business} to your account?</h1>
            <p className="lede">
              You&apos;ll be able to reply to reviews of {business} when you&apos;re signed in. Only say yes if this is
              your business. The link works once.
            </p>
          </div>
          <ClaimForm token={token} />
        </section>
      </main>
    );
  }

  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="link-title">
        <div>
          <p className="eyebrow">Your listing</p>
          <h1 id="link-title">We couldn&apos;t link your listing</h1>
        </div>
        <p role="alert" className="form-alert">
          <AlertIcon />
          {TRADER_LINK_ERRORS[state === "ok" ? "link_invalid" : state]}
        </p>
        <p className="lede">
          Email <a href={MAILTO}>{CONTACT_EMAIL}</a> or WhatsApp <a href={WHATSAPP}>{SUPPORT_WHATSAPP_DISPLAY}</a>.
        </p>
        <Button href={platformPath("account")} variant="secondary">
          Go to your account
        </Button>
      </section>
    </main>
  );
}
