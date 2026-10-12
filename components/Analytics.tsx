import Script from "next/script";

const BEACON = "https://static.cloudflareinsights.com/beacon.min.js";

/**
 * Cloudflare Web Analytics: cookieless page counts, so no consent banner. Nothing renders unless
 * CF_WEB_ANALYTICS_TOKEN is set; it is read when the page renders (at build for static pages), which keeps them static.
 * Left out of /admin (PlatformChrome's `analytics` prop). The CSP in lib/security-headers.ts allows the beacon.
 */
export function Analytics({ token = process.env.CF_WEB_ANALYTICS_TOKEN }: { token?: string }) {
  const t = token?.trim();
  if (!t) return null;
  return (
    <Script
      src={BEACON}
      strategy="afterInteractive"
      defer
      data-cf-beacon={JSON.stringify({ token: t })}
    />
  );
}
