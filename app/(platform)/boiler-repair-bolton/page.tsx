import type { Metadata } from "next";
import Link from "next/link";
import { AreaFilter } from "@/components/category/AreaFilter";
import { localPros } from "@/components/home/CategoryTile";
import { listProvidersInCategory } from "@/lib/directory";
import { HEATING_PATH, HEATING_TRADES, mergeHeatingLists } from "@/lib/heating";
import { platformPath } from "@/lib/paths";
import { pageMetadata } from "@/lib/seo";

// The winter landing page for "boiler repair Bolton" searches and ads: heating, gas and plumbing traders in one list
// (ordered by reviews alone, as the trade pages), what to check before calling, and a nudge for heating engineers to
// list. Static and cookie-free like the trade pages.
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "Boiler repair in Bolton: local heating engineers | Bolton Vouched",
  description:
    "Boiler broken or no heating in Bolton? Local heating engineers, gas engineers and plumbers covering BL1 to BL7. Call or WhatsApp them direct. Free, no sign-up.",
  path: HEATING_PATH,
});

const Info = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export default async function BoilerRepairPage() {
  const { ranked, newcomers } = mergeHeatingLists(await Promise.all(HEATING_TRADES.map((t) => listProvidersInCategory(t))));
  const total = ranked.length + newcomers.length;

  return (
    <main className="heat">
      <h1 className="page-title">Boiler broken in Bolton?</h1>
      <p className="page-sub">
        Local heating engineers, gas engineers and plumbers. Call or WhatsApp them direct: free, no sign-up, no middleman.
      </p>

      <p className="note">
        <Info />
        <span>
          Any work on a gas boiler must be done by a Gas Safe registered engineer. Ask to see their Gas Safe ID card and
          check it at{" "}
          <a href="https://www.gassaferegister.co.uk/" rel="noopener" target="_blank">
            gassaferegister.co.uk
          </a>
          .
        </span>
      </p>

      {total > 0 ? (
        <>
          <p className="heat-count">{localPros(total)} · ranked by reviews</p>
          <AreaFilter ranked={ranked} newcomers={newcomers} />
        </>
      ) : (
        <div className="empty">
          <p>
            <b>Nobody&apos;s listed for heating yet.</b>
          </p>
          <Link href={platformPath("trades")} className="link">
            Browse other trades
          </Link>
        </div>
      )}

      <section className="heat-tips" aria-labelledby="tips-title">
        <h2 id="tips-title">Before you call: three quick checks</h2>
        <ol>
          <li>
            <b>Pressure.</b> Most combi boilers want about 1 to 1.5 bar on the gauge when the heating&apos;s cold. Your
            manual says how to top it up.
          </li>
          <li>
            <b>Thermostat and timer.</b> Turn the thermostat up and check the timer hasn&apos;t switched the heating off.
          </li>
          <li>
            <b>Frozen pipe in a cold snap.</b> If the outside pipe from a condensing boiler has frozen, the boiler stops.
            Warm (not boiling) water over it can clear it, then reset the boiler.
          </li>
        </ol>
        <p>Smell gas? Don&apos;t wait for a trader: call the National Gas Emergency number, 0800 111 999, straight away.</p>
      </section>

      <section className="heat-recruit" aria-labelledby="recruit-title">
        <h2 id="recruit-title">Gas Safe engineer or plumber in Bolton?</h2>
        <p>Winter&apos;s your busiest season. List free, and Bolton customers call or WhatsApp you direct. No lead fees, ever.</p>
        <Link href="/for-traders" className="btn press btn-secondary">
          Get listed free
        </Link>
      </section>
    </main>
  );
}
