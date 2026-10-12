import type { Metadata } from "next";
import { ChevronRight, ShopIcon, TickIcon } from "@/components/auth/icons";
import { GroupCodeForm } from "@/components/auth/GroupCodeForm";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { requireMember } from "@/lib/auth";
import { platformPath } from "@/lib/paths";
import { signOutResident } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account | Bolton Vouched", robots: { index: false } };

function initialsOf(name: string): string {
  const [first, last] = name.split(" ");
  return (Array.from(first)[0] + (last ? Array.from(last)[0] : "")).toLocaleUpperCase("en-GB");
}

export default async function AccountPage() {
  const { account } = await requireMember("/platform/account");
  const name = account.displayName ?? "";
  const listings = account.providers;

  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="account-title">
        <p className="eyebrow">Your account</p>
        <div className="who-card">
          <span className="avatar" aria-hidden="true">
            {initialsOf(name)}
          </span>
          <div>
            <h1 id="account-title" className="name">
              <span className="signed">Signed in as</span> {name}
            </h1>
            {account.groupMember && (
              <Pill tone="sage">
                <TickIcon />
                Group member
              </Pill>
            )}
          </div>
        </div>
      </section>

      {listings.length > 0 && (
        <a href={platformPath("provider")} className="account-link press lift">
          <span className="ai">
            <ShopIcon />
          </span>
          <span>
            <b>Your listing</b>
            <small>{listings.map((l) => l.businessName).join(", ")}: see and reply to your reviews</small>
          </span>
          <ChevronRight />
        </a>
      )}

      {!account.groupMember && (
        <section className="auth-card" aria-labelledby="group-title">
          <div>
            <h2 id="group-title">In the WhatsApp group?</h2>
            <p className="lede">Add the group code and your reviews show a Group member badge.</p>
          </div>
          <GroupCodeForm />
        </section>
      )}

      <form action={signOutResident}>
        <Button type="submit" variant="secondary" className="w-full">
          Sign out
        </Button>
      </form>
    </main>
  );
}
