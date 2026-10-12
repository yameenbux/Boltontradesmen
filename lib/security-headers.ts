// Response headers for next.config.ts: HSTS, CSP and the usual hardening headers.
// http → https itself happens at Railway's edge (docs.railway.com: "Railway redirects HTTP to HTTPS"). An app-level
// X-Forwarded-Proto redirect also caught Next's own internal fetch after a server action redirect, so there isn't one.
// Pure (no "@/" imports, no server-only) so next.config.ts can import it and it can be unit tested.
type Env = Record<string, string | undefined>;
type Header = { key: string; value: string };

/** Origin of NEXT_PUBLIC_SUPABASE_URL (proof images, Storage, the auth redirect), or null when unset or invalid. */
export function supabaseOrigin(env: Env = process.env): string | null {
  const raw = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** True when NEXT_PUBLIC_SITE_URL is an https origin other than localhost, i.e. the live site, not a local build. */
function servedOverHttps(env: Env): boolean {
  try {
    const u = new URL(env.NEXT_PUBLIC_SITE_URL?.trim() ?? "");
    return u.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Content-Security-Policy without nonces: a nonce makes every page render per request, and the public pages must
 * stay static. 'unsafe-inline' scripts cover the theme and reveal scripts plus Next's inline bootstrap.
 * Cloudflare: Turnstile (challenges.cloudflare.com) and Web Analytics (beacon script, reports to cloudflareinsights).
 */
export function contentSecurityPolicy(env: Env = process.env): string {
  const supabase = supabaseOrigin(env);
  const withSupabase = (...sources: string[]) => (supabase ? [...sources, supabase] : sources);
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      [
        "'self'",
        "'unsafe-inline'",
        // React needs eval in development only (debugging stacks); production builds never do.
        ...(env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
        "https://challenges.cloudflare.com",
        "https://static.cloudflareinsights.com",
      ],
    ],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", withSupabase("'self'", "data:", "blob:")],
    ["font-src", ["'self'"]],
    ["connect-src", withSupabase("'self'", "https://cloudflareinsights.com")],
    ["frame-src", ["https://challenges.cloudflare.com"]],
    ["frame-ancestors", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    // Sign-in may post or redirect on to Google and Supabase Auth.
    ["form-action", withSupabase("'self'", "https://accounts.google.com")],
  ];
  const policy = directives.map(([name, sources]) => `${name} ${sources.join(" ")}`);
  // Only on the live https site: a local production build is served over plain http and would break.
  if (env.NODE_ENV === "production" && servedOverHttps(env)) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** Pages whose URL carries a private token: no Referer leaves them, and they stay out of search results. */
export const TOKEN_PATHS = ["/platform/consent/:path*", "/platform/link/:path*"] as const;

export function securityHeaders(env: Env = process.env) {
  const all: Header[] = [
    // Browsers ignore HSTS over plain http, so sending it from a local build is harmless.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "Content-Security-Policy", value: contentSecurityPolicy(env) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ];
  const noindex: Header = { key: "X-Robots-Tag", value: "noindex" };
  // Later entries win when two set the same key, so the token pages' Referrer-Policy overrides the default.
  return [
    { source: "/:path*", headers: all },
    { source: "/admin/:path*", headers: [noindex] },
    ...TOKEN_PATHS.map((source) => ({
      source,
      headers: [{ key: "Referrer-Policy", value: "no-referrer" }, noindex],
    })),
  ];
}
