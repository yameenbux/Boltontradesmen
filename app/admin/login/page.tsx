import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/LoginForm";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign in | Bolton Vouched", robots: { index: false } };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-5 py-6">
      <h1 className="a-title">Admin sign in</h1>
      <div className="a-card">
        <LoginForm captchaSiteKey={turnstileSiteKey()} />
      </div>
    </main>
  );
}
