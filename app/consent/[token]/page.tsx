import type { Metadata } from "next";
import Link from "next/link";
import { consentText, PRIVACY_PATH } from "@/lib/consent-text";
import { createServiceClient } from "@/lib/supabase/service";
import { ConsentForm } from "./ConsentForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your Bolton Vouched listing",
  robots: { index: false, follow: false },
};

type Preview = { business_name: string; categories: string[]; areas: string[] };

function Invalid() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-extrabold">This link is no longer valid</h1>
      <p className="mt-2">Please ask us for a new link.</p>
    </main>
  );
}

export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return <Invalid />;
  const { data } = await createServiceClient().rpc("consent_preview", { p_token: token });
  const p = (data as Preview[] | null)?.[0];
  if (!p) return <Invalid />;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8">
      <h1 className="break-words text-2xl font-extrabold">Your listing: {p.business_name}</h1>
      <dl className="flex flex-col gap-1">
        <div>
          <dt className="inline font-bold">Business name: </dt>
          <dd className="inline">{p.business_name}</dd>
        </div>
        <div>
          <dt className="inline font-bold">Categories: </dt>
          <dd className="inline">{p.categories.length ? p.categories.join(", ") : "None yet"}</dd>
        </div>
        <div>
          <dt className="inline font-bold">Areas: </dt>
          <dd className="inline">{p.areas.length ? p.areas.join(", ") : "None yet"}</dd>
        </div>
      </dl>
      <section aria-label="What you are agreeing to" className="flex flex-col gap-3">
        {consentText().map((para) => (
          <p key={para}>{para}</p>
        ))}
        <p>
          <Link href={PRIVACY_PATH} className="font-semibold underline">
            Read the privacy notice
          </Link>
        </p>
      </section>
      <ConsentForm token={token} />
    </main>
  );
}
