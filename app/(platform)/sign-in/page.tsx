import type { Metadata } from "next";
import { ViewBeacon } from "@/components/ViewBeacon";
import { AlertIcon, ChatIcon, LockIcon } from "@/components/auth/icons";
import { EmailCodeForm } from "@/components/auth/EmailCodeForm";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { SignInForm } from "@/components/auth/SignInForm";
import { asksIntent, TRADER_SIGN_IN, TRADER_START } from "@/lib/account-intent";
import { GOOGLE_SIGN_IN_ERROR } from "@/lib/google-callback";
import { platformPath } from "@/lib/paths";
import { safeNext } from "@/lib/safe-next";
import { phoneSignInEnabled } from "@/lib/sign-in-methods";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sign in | Bolton Vouched",
  description: "Sign in to Bolton Vouched to leave a review or manage your account.",
  robots: { index: false },
};

function heading(next: string) {
  if (/^\/p\/[^/]+\/review/.test(next)) return "Sign in to leave a review";
  if (next.startsWith("/report/")) return "Sign in to report a review";
  if (next.startsWith("/provider")) return "Log in or join as a trader";
  if (next.startsWith("/link/")) return "Sign in to link your listing";
  return "Log in or create an account";
}

function Divider({ children }: { children: string }) {
  return (
    <p className="or-divider">
      <span>{children}</span>
    </p>
  );
}

type Search = { next?: string | string[]; error?: string | string[] };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const next = safeNext(Array.isArray(params.next) ? params.next[0] : params.next);
  const googleFailed = (Array.isArray(params.error) ? params.error[0] : params.error) === "google";
  // Read at request time (SIGN_IN_PHONE): only enabled methods are shown.
  const phoneOn = phoneSignInEnabled();
  const trader = next.startsWith(TRADER_START);
  return (
    <main className="auth">
      {/* One account works for both: this only decides where you land after signing in, and the wording. */}
      {(trader || asksIntent(next)) && (
        <nav className="who-switch" aria-label="Who are you signing in as?">
          <a href={platformPath("sign-in")} aria-current={trader ? undefined : "page"}>
            I need a trader
          </a>
          <a href={TRADER_SIGN_IN} aria-current={trader ? "page" : undefined} data-testid="trader-sign-in">
            I&apos;m a trader
          </a>
        </nav>
      )}
      <section className="auth-card" aria-labelledby="signin-title">
        <EmailCodeForm
          next={next}
          captchaSiteKey={turnstileSiteKey()}
          title={heading(next)}
          before={
            <>
              {googleFailed && (
                <p role="alert" className="form-alert">
                  <AlertIcon />
                  {GOOGLE_SIGN_IN_ERROR}
                </p>
              )}
              <GoogleButton next={next} />
              <Divider>or use your email</Divider>
            </>
          }
        />
        {phoneOn && (
          <>
            <Divider>or use your mobile</Divider>
            <SignInForm next={next} title="Use your mobile number" level={2} />
          </>
        )}
      </section>
      <ul className="reassure">
        <li>
          <span className="ri">
            <LockIcon />
          </span>
          <span>Your email address is only used to sign you in. It&apos;s never shown on the site.</span>
        </li>
        <li>
          <span className="ri">
            <ChatIcon />
          </span>
          {trader ? (
            <span>
              New to Bolton Vouched? Next is one short form about your business, with Free or Pro. Already listed?
              Use the email or mobile number you gave us.
            </span>
          ) : (
            <span>Looking and calling never needs an account. You only sign in to ask, review or reply.</span>
          )}
        </li>
      </ul>
      {trader && <ViewBeacon kind="funnel" slug="trader-sign-in" />}
    </main>
  );
}
