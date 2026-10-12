import type { Metadata } from "next";
import { ChatIcon, LockIcon } from "@/components/auth/icons";
import { EmailCodeForm } from "@/components/auth/EmailCodeForm";
import { SignInForm } from "@/components/auth/SignInForm";
import { safeNext } from "@/lib/safe-next";
import { phoneSignInEnabled } from "@/lib/sign-in-methods";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in | Bolton Vouched", robots: { index: false } };

function heading(next: string) {
  if (/^\/platform\/p\/[^/]+\/review/.test(next)) return "Sign in to leave a review";
  if (next.startsWith("/platform/report/")) return "Sign in to report a review";
  if (next.startsWith("/platform/provider")) return "Sign in to reply to reviews";
  return "Sign in to Bolton Vouched";
}

function Divider({ children }: { children: string }) {
  return (
    <p className="or-divider">
      <span>{children}</span>
    </p>
  );
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const raw = (await searchParams).next;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw);
  // Read at request time (SIGN_IN_PHONE): only enabled methods are shown.
  const phoneOn = phoneSignInEnabled();
  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="signin-title">
        <EmailCodeForm next={next} title={heading(next)} before={<Divider>or use your email</Divider>} />
        {phoneOn && (
          <>
            <Divider>or use your mobile</Divider>
            <SignInForm next={next} title="Sign in with your mobile" level={2} />
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
          <span>Looking and calling never needs an account. You only sign in to leave or reply to a review.</span>
        </li>
      </ul>
    </main>
  );
}
