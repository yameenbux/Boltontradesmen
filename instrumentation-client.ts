import * as Sentry from "@sentry/nextjs";

// Error tracking in the browser (see instrumentation.ts), only when NEXT_PUBLIC_SENTRY_DSN was set at build time.
// Errors only: no performance tracing, no session replay, no personal data.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || "production",
    // Sentry collects all of these by default; we send none of them (no user, IP, cookies, headers, bodies or
    // query strings, which can hold sign-in codes and payment session ids).
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: 0,
    // Noise from browser extensions and old in-app browsers, not our code.
    ignoreErrors: ["ResizeObserver loop", "Non-Error promise rejection captured"],
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-web-extension:\/\//],
  });
}
