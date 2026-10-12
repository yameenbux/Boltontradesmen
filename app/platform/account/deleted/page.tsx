import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { platformPath } from "@/lib/paths";

// Where Delete account lands. It reads no session (the person is already signed out) and says what happened.
export const metadata: Metadata = {
  title: "Account deleted | Bolton Vouched",
  description: "Your Bolton Vouched account has been deleted.",
  robots: { index: false },
};

export default function AccountDeletedPage() {
  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="deleted-title">
        <div className="done">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" />
            <path d="M30 52 44 65 71 37" />
          </svg>
          <h1 id="deleted-title">Your account is deleted</h1>
          <p>
            Your reviews and replies are down and you&apos;re signed out. We keep your mobile number privately for 12
            months, then delete it.
          </p>
        </div>
        <Button href={platformPath()}>Back to the directory</Button>
        <p className="post-note">You can sign up again with the same number at any time.</p>
      </section>
    </main>
  );
}
