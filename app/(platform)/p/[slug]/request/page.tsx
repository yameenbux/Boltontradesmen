import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LockIcon } from "@/components/auth/icons";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JobRequestForm } from "@/components/profile/JobRequestForm";
import { Button } from "@/components/ui/Button";
import { requestJob } from "@/app/(platform)/p/[slug]/request/actions";
import { getProvider } from "@/lib/directory";
import { BL_DISTRICTS } from "@/lib/districts";
import { formStartToken } from "@/lib/form-timing";
import { platformPath } from "@/lib/paths";
import { turnstileSiteKey } from "@/lib/turnstile";

// Per request (the Turnstile key and the signed start time), and cookie-free: the action uses no auth client.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProvider((await params).slug);
  return {
    title: p ? `Request a quote from ${p.businessName} | Bolton Vouched` : "Request a quote | Bolton Vouched",
    robots: { index: false },
  };
}

export default async function RequestQuotePage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProvider((await params).slug);
  if (!p) notFound();
  const back = platformPath("p", p.slug);

  return (
    <main className="auth">
      <Breadcrumbs
        plain
        trail={[
          { name: p.businessName, path: back },
          { name: "Request a quote", path: platformPath("p", p.slug, "request") },
        ]}
      />
      <section className="auth-card" aria-labelledby="rq-title">
        <div>
          <p className="eyebrow">Request a quote</p>
          <h1 id="rq-title">Tell {p.businessName} about the job</h1>
          <p className="lede">
            {p.takesRequests
              ? "They get it straight away, and get back to you on the number you give."
              : "This trader isn't taking requests through the site right now."}
          </p>
        </div>
        {p.takesRequests ? (
          <JobRequestForm
            action={requestJob.bind(null, p.slug)}
            started={formStartToken()}
            captchaSiteKey={turnstileSiteKey()}
            areas={BL_DISTRICTS}
          />
        ) : (
          <Button href={back}>Call them from their page</Button>
        )}
      </section>
      <ul className="reassure">
        <li>
          <span className="ri">
            <LockIcon />
          </span>
          <span>
            Only {p.businessName} sees your details, to reply about this job. Requests are deleted after 180 days. See
            the <a href="/privacy">privacy notice</a>.
          </span>
        </li>
      </ul>
    </main>
  );
}
