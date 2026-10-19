import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WelcomeForm } from "@/components/auth/WelcomeForm";
import { asksIntent } from "@/lib/account-intent";
import { requireSignedIn } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Welcome | Bolton Vouched",
  description: "Choose the name shown with your reviews on Bolton Vouched.",
  robots: { index: false },
};

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const raw = (await searchParams).next;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw);
  const { supabase } = await requireSignedIn(`/platform/welcome?next=${encodeURIComponent(next)}`);
  const { data } = await supabase.rpc("my_account");
  const row = data as { display_name: string | null; deleted: boolean } | null;
  if (row?.display_name && !row.deleted) redirect(next);

  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="welcome-title">
        <div>
          <p className="eyebrow">You&apos;re signed in</p>
          <h1 id="welcome-title">Welcome to Bolton Vouched</h1>
          <p className="lede">
            A couple of quick details. We show your first name and the first letter of your surname, like <b>Sarah K.</b>
          </p>
        </div>
        <WelcomeForm next={next} askIntent={asksIntent(next)} />
      </section>
    </main>
  );
}
