import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DECK } from "@/components/site/content";

// Reviews, replies and phone sign-in are live (Plan 2). Nothing public may still say they're on the way.
// "Coming soon" stays allowed for what isn't built yet (community questions, trader dashboards, Verified).
const ROOTS = ["app", "components", "lib", "docs/launch"];
const STALE = [
  "reviews coming soon",
  "reviews are coming soon",
  "once reviews open",
  "when reviews arrive",
  "you'll be able to reply",
  "will be able to leave",
  "reviews, coming soon",
  "cookies are used only for the admin",
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|md|mdx|css)$/.test(name) ? [p] : [];
  });
}

describe("no stale 'reviews are coming' claims", () => {
  const all = ROOTS.flatMap((r) => files(path.join(process.cwd(), r)));

  it("finds the files to check", () => {
    expect(all.length).toBeGreaterThan(50);
  });

  for (const phrase of STALE) {
    it(`nothing says "${phrase}"`, () => {
      const hits = all.filter((f) => readFileSync(f, "utf8").replace(/’/g, "'").toLowerCase().includes(phrase));
      expect(hits.map((f) => path.relative(process.cwd(), f))).toEqual([]);
    });
  }

  it("no showcase card or trader point is marked soon", () => {
    expect(DECK.filter((c) => c.soon)).toEqual([]);
    const page = readFileSync(path.join(process.cwd(), "app/(site)/page.tsx"), "utf8");
    expect(page).not.toMatch(/soon:\s*true/);
  });
});

// Plan 2b: sign-in is Google or an email code. Nothing public may still say people sign in with their mobile.
// The phone path's own code (kept behind SIGN_IN_PHONE) is exempt.
const PHONE_EXEMPT = new Set([
  "lib/otp-gate.ts",
  "lib/line-type.ts",
  "lib/sms-hook.ts",
  "components/auth/SignInForm.tsx",
]);
const PHONE_SIGN_IN = ["uk mobile", "sign in with your mobile", "signing in with your number", "with the number on your listing", "twilio"];

describe("no claims that sign-in needs a mobile number", () => {
  const all = [
    ...["app", "components", "lib"].flatMap((r) => files(path.join(process.cwd(), r))),
    path.join(process.cwd(), "docs/launch/LAUNCH.md"),
  ].filter((f) => {
    const rel = path.relative(process.cwd(), f);
    return !PHONE_EXEMPT.has(rel) && !/^lib\/phone[^/]*\.ts$/.test(rel);
  });

  for (const phrase of PHONE_SIGN_IN) {
    it(`nothing says "${phrase}"`, () => {
      const hits = all.filter((f) => readFileSync(f, "utf8").replace(/’/g, "'").toLowerCase().includes(phrase));
      expect(hits.map((f) => path.relative(process.cwd(), f))).toEqual([]);
    });
  }
});
