import * as Sentry from "@sentry/nextjs";

// Error tracking (Sentry, project bolton-vouched in the EU region): server errors, only when SENTRY_DSN is set.
// Errors only, no performance tracing, and no personal data (no IP addresses, cookies or request bodies).
export function register() {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || "production",
    // Sentry collects all of these by default; we send none of them (no user, IP, cookies, headers, bodies or
    // query strings, which can hold sign-in codes and payment session ids).
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: 0,
  });
}

// Reports errors from server components, route handlers and server actions. A no-op until init has run.
export const onRequestError = Sentry.captureRequestError;
