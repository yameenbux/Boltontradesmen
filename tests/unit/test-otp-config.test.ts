import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// The test phone numbers (code 123456, no SMS sent) must be identical in the Supabase CLI config (CI)
// and the local stack (sandboxes), and must all sit in Ofcom's 07700 900xxx drama range.
const EXPECTED = ["447700900301", ...Array.from({ length: 9 }, (_, i) => `44770090040${i + 1}`), "447700900411"];
const root = path.resolve(__dirname, "../..");

function configTestOtps(): Record<string, string> {
  const toml = readFileSync(path.join(root, "supabase/config.toml"), "utf8");
  const section = /^\[auth\.sms\.test_otp\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(toml);
  if (!section) throw new Error("[auth.sms.test_otp] not found in supabase/config.toml");
  const out: Record<string, string> = {};
  for (const line of section[1].split("\n")) {
    const m = /^\s*"?(\d+)"?\s*=\s*"(\d+)"\s*(#.*)?$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function startShTestOtps(): Record<string, string> {
  const sh = readFileSync(path.join(root, "scripts/local-stack/start.sh"), "utf8");
  const m = /GOTRUE_SMS_TEST_OTP="?([^"\s\\]+)"?/.exec(sh);
  if (!m) throw new Error("GOTRUE_SMS_TEST_OTP= not found in scripts/local-stack/start.sh");
  return Object.fromEntries(m[1].split(",").map((pair) => pair.split(":") as [string, string]));
}

describe("test OTP numbers", () => {
  it("config.toml lists exactly the shared numbers, each with 123456", () => {
    expect(configTestOtps()).toEqual(Object.fromEntries(EXPECTED.map((n) => [n, "123456"])));
  });

  it("the local stack lists exactly the same numbers", () => {
    expect(startShTestOtps()).toEqual(Object.fromEntries(EXPECTED.map((n) => [n, "123456"])));
  });

  it("every number is in the 07700 900xxx drama range", () => {
    for (const n of [...Object.keys(configTestOtps()), ...Object.keys(startShTestOtps())]) {
      expect(n).toMatch(/^447700900\d{3}$/);
    }
  });
});

// Final review C1: a phone account must always be confirmed with a code sent to the phone. The database
// guard refuses phone sign-ups that arrive already confirmed, so local and CI run with confirmations on,
// exactly like production.
describe("phone confirmations", () => {
  it("are required in config.toml (CI)", () => {
    const toml = readFileSync(path.join(root, "supabase/config.toml"), "utf8");
    const section = /^\[auth\.sms\]\s*$([\s\S]*?)(?=^\[)/m.exec(toml);
    expect(section?.[1]).toMatch(/^enable_confirmations = true$/m);
  });

  it("are required on the local stack (no SMS autoconfirm)", () => {
    const sh = readFileSync(path.join(root, "scripts/local-stack/start.sh"), "utf8");
    expect(sh).toMatch(/GOTRUE_SMS_AUTOCONFIRM=false/);
    expect(sh).not.toMatch(/GOTRUE_SMS_AUTOCONFIRM=true/);
  });
});

// Final review I1: the local stack sends every non-test text through the app's Send SMS hook, signed with a
// dummy secret the app (via .env.example) must share. CI's Supabase CLI stack leaves the hook off.
describe("Send SMS hook (local stack)", () => {
  const sh = readFileSync(path.join(root, "scripts/local-stack/start.sh"), "utf8");
  const envExample = readFileSync(path.join(root, ".env.example"), "utf8");

  it("is enabled and points at the app's hook route", () => {
    expect(sh).toMatch(/GOTRUE_HOOK_SEND_SMS_ENABLED=true/);
    // The phone E2E project serves the app with SIGN_IN_PHONE=on at :3001 (playwright.config.ts).
    expect(sh).toContain('GOTRUE_HOOK_SEND_SMS_URI="${SMS_HOOK_URL:-http://localhost:3001/api/auth/sms-hook}"');
  });

  it("signs with the same secret the app reads from .env.example", () => {
    const stack = /GOTRUE_HOOK_SEND_SMS_SECRETS="?([^"\s\\]+)"?/.exec(sh)?.[1];
    const app = /^SUPABASE_SMS_HOOK_SECRET=(.+)$/m.exec(envExample)?.[1];
    expect(stack).toMatch(/^v1,whsec_[A-Za-z0-9+/=]+$/);
    expect(app).toBe(stack);
  });
});
