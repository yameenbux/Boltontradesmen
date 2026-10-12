import type { Metadata } from "next";
import { ChatIcon, LockIcon } from "@/components/auth/icons";
import { SignInForm } from "@/components/auth/SignInForm";
import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sign in | Bolton Vouched",
  description: "Sign in to Bolton Vouched to leave a review or manage your account.",
  robots: { index: false },
};

function heading(next: string) {
  if (/^\/platform\/p\/[^/]+\/review/.test(next)) return "Sign in to leave a review";
  if (next.startsWith("/platform/report/")) return "Sign in to report a review";
  if (next.startsWith("/platform/provider")) return "Sign in to reply to reviews";
  return "Sign in with your mobile";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const raw = (await searchParams).next;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw);
  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="signin-title">
        <SignInForm next={next} title={heading(next)} />
      </section>
      <ul className="reassure">
        <li>
          <span className="ri">
            <LockIcon />
          </span>
          <span>Your number is only used to send sign-in codes. It&apos;s never shown on the site.</span>
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
