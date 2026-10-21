import { describe, expect, it } from "vitest";
import {
  accessToken,
  grantFor,
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
    // The cookie is keyed with the server secret: without one there's no lock cookie at all.
    expect(() => accessToken("beta-2026", { SITE_LOCK_PASSWORD: "beta-2026" })).toThrow(/DEVICE_HASH_SECRET/);
  });

  it("never blocks machine traffic or the lock page", () => {
    for (const p of ["/site-lock", "/api/stripe/webhook", "/api/cron/payment-reminders", "/auth/callback", "/robots.txt"]) {
      expect(isOpenPath(p)).toBe(true);
    }
    for (const p of ["/", "/c/plumber", "/admin", "/sitemap.xml"]) expect(isOpenPath(p)).toBe(false);
  });

  it("knows which links a trader shares (the database then checks they're real)", () => {
    const id = "9F0C2B1E-0000-4000-8000-000000000000";
    expect(grantFor("/p/ace-plumbing/review")).toEqual({ kind: "review", key: "ace-plumbing" });
    expect(grantFor(`/d/${id}`)).toEqual({ kind: "doc", key: id.toLowerCase() });
    expect(grantFor(`/consent/${id}/`)).toEqual({ kind: "consent", key: id.toLowerCase() });
    expect(grantFor(`/link/${id}`)).toEqual({ kind: "link", key: id.toLowerCase() });
    // Not the shape of a real link: no database call, no access.
    for (const p of ["/consent/abc", "/link/abc", "/d/x", "/p/ace-plumbing", "/provider", "/p/a/b/review"]) {
      expect(grantFor(p)).toBeNull();
    }
  });

  it("only sends people back to this site", () => {
    expect(safeReturn("/c/plumber?area=BL3")).toBe("/c/plumber?area=BL3");
    expect(safeReturn("//evil.example")).toBe("/");
    expect(safeReturn("https://evil.example")).toBe("/");
    expect(safeReturn("/site-lock?next=/x")).toBe("/");
    expect(safeReturn(null)).toBe("/");
    expect(safeReturn("/admin")).toBe("/admin");
    // Browsers strip tabs and newlines, so these would become //evil.example.
    for (const raw of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/\\evil.example", "/ /evil.example"]) {
      expect(safeReturn(raw)).toBe("/");
    }
    expect(safeReturn("/_next/static/x.js")).toBe("/");
  });

  it("robots.txt shuts everything while locked", () => {
    expect(buildRobots("https://example.test", true)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(buildRobots("https://example.test", false).sitemap).toBe("https://example.test/sitemap.xml");
  });
});
