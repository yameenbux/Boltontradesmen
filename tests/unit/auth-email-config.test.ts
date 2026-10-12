import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The Supabase CLI config (CI) and the Docker-free local stack (scripts/local-stack/start.sh) must agree on
// how sign-in emails work, and the one template must show the code and never a link.
const root = path.resolve(__dirname, "../..");
const toml = readFileSync(path.join(root, "supabase/config.toml"), "utf8");
const startSh = readFileSync(path.join(root, "scripts/local-stack/start.sh"), "utf8");
const template = readFileSync(path.join(root, "supabase/templates/sign-in-code.html"), "utf8");

const SUBJECT = "Your Bolton Vouched sign-in code";

function section(name: string): Record<string, string> {
  const escaped = name.replace(/[.]/g, "\\.");
  const m = new RegExp(`^\\[${escaped}\\]\\s*$([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, "m").exec(toml);
  if (!m) throw new Error(`[${name}] not found in supabase/config.toml`);
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^\s*([a-z_]+)\s*=\s*(.+?)\s*(#.*)?$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

function env(name: string): string {
  const m = new RegExp(`\\b${name}=("([^"]*)"|[^\\s\\\\]+)`).exec(startSh);
  if (!m) throw new Error(`${name}= not found in scripts/local-stack/start.sh`);
  return m[2] ?? m[1];
}

describe("sign-in email settings", () => {
  const email = section("auth.email");

  it("6-digit codes that expire after 15 minutes, in both stacks", () => {
    expect(email.otp_length).toBe("6");
    expect(env("GOTRUE_MAILER_OTP_LENGTH")).toBe("6");
    expect(email.otp_expiry).toBe("900");
    expect(env("GOTRUE_MAILER_OTP_EXP")).toBe("900");
  });

  it("new accounts must confirm by code (no autoconfirm)", () => {
    expect(email.enable_confirmations).toBe("true");
    expect(env("GOTRUE_MAILER_AUTOCONFIRM")).toBe("false");
  });

  it("both templates use the one file and the same subject", () => {
    for (const t of ["confirmation", "magic_link"]) {
      const s = section(`auth.email.template.${t}`);
      expect(s.subject).toBe(SUBJECT);
      expect(s.content_path).toBe("./supabase/templates/sign-in-code.html");
    }
    expect(env("GOTRUE_MAILER_SUBJECTS_CONFIRMATION")).toBe(SUBJECT);
    expect(env("GOTRUE_MAILER_SUBJECTS_MAGIC_LINK")).toBe(SUBJECT);
    expect(env("GOTRUE_MAILER_TEMPLATES_CONFIRMATION")).toBe("http://127.0.0.1:54324/templates/sign-in-code.html");
    expect(env("GOTRUE_MAILER_TEMPLATES_MAGIC_LINK")).toBe("http://127.0.0.1:54324/templates/sign-in-code.html");
  });

  it("the local stack sends from noreply@ysbdesigns.uk as Bolton Vouched", () => {
    expect(env("GOTRUE_SMTP_ADMIN_EMAIL")).toBe("noreply@ysbdesigns.uk");
    expect(env("GOTRUE_SMTP_SENDER_NAME")).toBe("Bolton Vouched");
  });

  it("Google is enabled in both, with the same dummy client", () => {
    const google = section("auth.external.google");
    expect(google.enabled).toBe("true");
    expect(google.skip_nonce_check).toBe("false");
    expect(env("GOTRUE_EXTERNAL_GOOGLE_ENABLED")).toBe("true");
    expect(google.client_id).toBe("local-dummy.apps.googleusercontent.com");
    expect(env("GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID")).toBe(google.client_id);
    expect(env("GOTRUE_EXTERNAL_GOOGLE_SECRET")).toBe(google.secret);
  });
});

describe("sign-in code template", () => {
  it("shows the code and contains no link", () => {
    expect(template).toContain("{{ .Token }}");
    expect(template).not.toContain("ConfirmationURL");
    expect(template).not.toContain("href=");
    expect(template).toContain("Your sign-in code");
    expect(template).toContain("It expires in 15 minutes. If you didn't ask for it, ignore this email.");
    expect(template).toContain("Bolton Vouched · boltonvouched.ysbdesigns.uk");
  });
});
