import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
