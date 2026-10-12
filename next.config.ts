import type { NextConfig } from "next";

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
  async redirects() {
    return [
      // The directory moved under /platform. Old links (shared in WhatsApp, sent as consent links) keep working: 308.
      { source: "/c/:category", destination: "/platform/c/:category", permanent: true },
      { source: "/p/:slug", destination: "/platform/p/:slug", permanent: true },
      { source: "/consent/:token", destination: "/platform/consent/:token", permanent: true },
    ];
  },
};

export default nextConfig;
