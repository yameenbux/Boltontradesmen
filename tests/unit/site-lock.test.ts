import { describe, expect, it } from "vitest";
import {
  accessToken,
  grantsAccess,
  hasAccess,
  isOpenPath,
  lockPassword,
  passwordMatches,
  safeReturn,
} from "@/lib/site-lock";
import { buildRobots } from "@/lib/seo";

const env = { SITE_LOCK_PASSWORD: "beta-2026", DEVICE_HASH_SECRET: "secret" };

describe("pre-launch site lock", () => {
  it("is on only when a password is set", () => {
    expect(lockPassword({})).toBeNull();
    expect(lockPassword({ SITE_LOCK_PASSWORD: "  " })).toBeNull();
    expect(lockPassword(env)).toBe("beta-2026");
  });

  it("checks the password and the access cookie", () => {
    expect(passwordMatches(" beta-2026 ", "beta-2026")).toBe(true);
    expect(passwordMatches("beta-2025", "beta-2026")).toBe(false);
    const token = accessToken("beta-2026", env);
    expect(hasAccess(token, "beta-2026", env)).toBe(true);
    expect(hasAccess(undefined, "beta-2026", env)).toBe(false);
    // A new password signs everyone out.
    expect(hasAccess(token, "new-password", env)).toBe(false);
  });

  it("never blocks machine traffic or the lock page", () => {
    for (const p of ["/site-lock", "/api/stripe/webhook", "/api/cron/payment-reminders", "/platform/auth/callback", "/robots.txt"]) {
      expect(isOpenPath(p)).toBe(true);
    }
    for (const p of ["/", "/platform", "/platform/c/plumber", "/admin", "/sitemap.xml"]) expect(isOpenPath(p)).toBe(false);
  });

  it("lets in someone a trader sent a link to", () => {
    expect(grantsAccess("/platform/p/ace-plumbing/review")).toBe(true);
    expect(grantsAccess("/platform/d/9f0c2b1e-0000-4000-8000-000000000000")).toBe(true);
    expect(grantsAccess("/platform/consent/abc")).toBe(true);
    expect(grantsAccess("/platform/link/abc")).toBe(true);
    expect(grantsAccess("/platform/p/ace-plumbing")).toBe(false);
    expect(grantsAccess("/platform/provider")).toBe(false);
  });

  it("only sends people back to this site", () => {
    expect(safeReturn("/platform/c/plumber?area=BL3")).toBe("/platform/c/plumber?area=BL3");
    expect(safeReturn("//evil.example")).toBe("/");
    expect(safeReturn("https://evil.example")).toBe("/");
    expect(safeReturn("/site-lock?next=/x")).toBe("/");
    expect(safeReturn(null)).toBe("/");
  });

  it("robots.txt shuts everything while locked", () => {
    expect(buildRobots("https://example.test", true)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(buildRobots("https://example.test", false).sitemap).toBe("https://example.test/sitemap.xml");
  });
});
