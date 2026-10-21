import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  experimental: {
    // The review form can carry a proof file of up to 10 MB (lib/proofs.ts), plus the answers.
    serverActions: { bodySizeLimit: "11mb" },
    // The review route is inside proxy.ts's matcher, which buffers request bodies (10 MB by default).
    proxyClientMaxBodySize: "11mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    // HSTS, CSP and the other hardening headers on every route; see lib/security-headers.ts.
    return securityHeaders();
  },
  async redirects() {
    return [
      // The directory lived under /platform until it became the home page. Old links (shared in WhatsApp, sent as
      // consent, review, quote and invoice links, in Google) keep working: 308, query string kept.
      { source: "/platform", destination: "/", permanent: true },
      { source: "/platform/:path*", destination: "/:path*", permanent: true },
      // The trader's review link and QR card (lib/review-link.ts): short to type and to scan, 308 to the review form.
      // ref=card records where the review started, for the admin.
      { source: "/r/:slug([a-z0-9-]+)", destination: "/p/:slug/review?ref=card", permanent: true },
    ];
  },
};

export default nextConfig;
