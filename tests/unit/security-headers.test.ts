import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders, supabaseOrigin } from "@/lib/security-headers";

const PROD = { NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/" };
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `));

describe("supabaseOrigin", () => {
  it("returns the origin, or null when unset or not a URL", () => {
    expect(supabaseOrigin(PROD)).toBe("https://abc.supabase.co");
    expect(supabaseOrigin({})).toBeNull();
    expect(supabaseOrigin({ NEXT_PUBLIC_SUPABASE_URL: "nope" })).toBeNull();
  });
});

describe("contentSecurityPolicy", () => {
  it("lets the browser send error reports to Sentry only when NEXT_PUBLIC_SENTRY_DSN is a Sentry address", () => {
    const dsn = "https://abc123@o1.ingest.de.sentry.io/42";
    expect(directive(contentSecurityPolicy({ ...PROD, NEXT_PUBLIC_SENTRY_DSN: dsn }), "connect-src")).toBe(
      "connect-src 'self' https://cloudflareinsights.com https://abc.supabase.co https://o1.ingest.de.sentry.io",
    );
    expect(directive(contentSecurityPolicy({ ...PROD, NEXT_PUBLIC_SENTRY_DSN: "https://x@evil.example/1" }), "connect-src")).toBe(
      "connect-src 'self' https://cloudflareinsights.com https://abc.supabase.co",
    );
  });

  it("allows Supabase for images, fetches and forms, plus Turnstile and Cloudflare analytics", () => {
    const csp = contentSecurityPolicy(PROD);
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "script-src")).toBe(
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
    );
    expect(directive(csp, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(csp, "img-src")).toBe("img-src 'self' data: blob: https://abc.supabase.co");
    expect(directive(csp, "font-src")).toBe("font-src 'self'");
    expect(directive(csp, "connect-src")).toBe(
      "connect-src 'self' https://cloudflareinsights.com https://abc.supabase.co",
    );
    expect(directive(csp, "form-action")).toBe(
      "form-action 'self' https://accounts.google.com https://abc.supabase.co",
    );
    expect(directive(csp, "frame-src")).toBe("frame-src https://challenges.cloudflare.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("allows eval in development only", () => {
    expect(contentSecurityPolicy({ NODE_ENV: "development" })).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy(PROD)).not.toContain("'unsafe-eval'");
  });

  it("copes with no Supabase URL", () => {
    const csp = contentSecurityPolicy({ NODE_ENV: "production" });
    expect(directive(csp, "img-src")).toBe("img-src 'self' data: blob:");
    expect(csp).not.toContain("undefined");
    expect(csp).not.toContain("null");
  });

  it("upgrades insecure requests only on the live https site", () => {
    const live = { ...PROD, NEXT_PUBLIC_SITE_URL: "https://boltonvouched.ysbdesigns.uk" };
    expect(contentSecurityPolicy(live)).toMatch(/; upgrade-insecure-requests$/);
    expect(contentSecurityPolicy({ ...PROD, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).not.toContain("upgrade");
    expect(contentSecurityPolicy({ ...PROD, NEXT_PUBLIC_SITE_URL: "https://localhost:3000" })).not.toContain("upgrade");
    expect(contentSecurityPolicy(PROD)).not.toContain("upgrade");
    expect(contentSecurityPolicy({ ...live, NODE_ENV: "development" })).not.toContain("upgrade");
  });
});

describe("securityHeaders", () => {
  const rules = securityHeaders(PROD);
  const value = (source: string, key: string) =>
    rules.find((r) => r.source === source)?.headers.find((h) => h.key === key)?.value;

  it("hardens every route", () => {
    expect(value("/:path*", "Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    expect(value("/:path*", "X-Content-Type-Options")).toBe("nosniff");
    expect(value("/:path*", "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(value("/:path*", "X-Frame-Options")).toBe("DENY");
    expect(value("/:path*", "Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    expect(value("/:path*", "Content-Security-Policy")).toBe(contentSecurityPolicy(PROD));
  });

  it("keeps admin and token links out of search, and token links send no Referer", () => {
    expect(value("/admin/:path*", "X-Robots-Tag")).toBe("noindex");
    for (const p of ["/consent/:path*", "/link/:path*"]) {
      expect(value(p, "X-Robots-Tag")).toBe("noindex");
      expect(value(p, "Referrer-Policy")).toBe("no-referrer");
    }
    // Next applies every matching rule in order, the last one winning, so the override must follow the catch-all.
    const order = rules.map((r) => r.source);
    expect(order.indexOf("/consent/:path*")).toBeGreaterThan(order.indexOf("/:path*"));
  });
});
