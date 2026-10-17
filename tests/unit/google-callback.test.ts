import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const auth = { exchangeCodeForSession: vi.fn() };
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerAuthClient: async () => ({ auth, rpc }) }));

import { GOOGLE_SIGN_IN_ERROR, googleCallbackPath } from "@/lib/google-callback";
import { GET, dynamic } from "@/app/platform/auth/callback/route";
import { NextRequest } from "next/server";

const REVIEW = "/platform/p/ace/review";
const SIGN_IN_ERROR = `/platform/sign-in?error=google&next=${encodeURIComponent(REVIEW)}`;
const member = async () => ({ display_name: "Sarah K.", deleted: false });

beforeEach(() => {
  auth.exchangeCodeForSession.mockReset();
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("GOOGLE_SIGN_IN_ERROR", () => {
  it("has the exact copy", () => {
    expect(GOOGLE_SIGN_IN_ERROR).toBe("We couldn't sign you in with Google. Please try again, or use an email code. If you've signed in with an email code before, use that.");
  });
});

// Review Focus 3: cancelled, or refused by the database → back to sign-in with the Google copy, never a 500.
describe("googleCallbackPath", () => {
  it("sends a cancelled sign-in back to sign-in, keeping next", async () => {
    const exchange = vi.fn(async () => true);
    expect(
      await googleCallbackPath({ code: null, error: "access_denied", next: REVIEW }, { exchange, account: member }),
    ).toBe(SIGN_IN_ERROR);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("treats the guard's 'Database error saving new user' (server_error) the same way", async () => {
    expect(
      await googleCallbackPath(
        { code: null, error: "server_error", next: REVIEW },
        { exchange: async () => true, account: member },
      ),
    ).toBe(SIGN_IN_ERROR);
  });

  it("needs a code", async () => {
    expect(
      await googleCallbackPath({ code: null, error: null, next: REVIEW }, { exchange: async () => true, account: member }),
    ).toBe(SIGN_IN_ERROR);
  });

  it("goes back to sign-in when the exchange fails or throws", async () => {
    expect(
      await googleCallbackPath({ code: "c", error: null, next: REVIEW }, { exchange: async () => false, account: member }),
    ).toBe(SIGN_IN_ERROR);
    expect(
      await googleCallbackPath(
        { code: "c", error: null, next: REVIEW },
        {
          exchange: async () => {
            throw new Error("boom");
          },
          account: member,
        },
      ),
    ).toBe(SIGN_IN_ERROR);
  });

  it("sends a new (or deleted) account to Welcome, keeping next", async () => {
    const welcome = `/platform/welcome?next=${encodeURIComponent(REVIEW)}`;
    expect(
      await googleCallbackPath({ code: "c", error: null, next: REVIEW }, { exchange: async () => true, account: async () => null }),
    ).toBe(welcome);
    expect(
      await googleCallbackPath(
        { code: "c", error: null, next: REVIEW },
        { exchange: async () => true, account: async () => ({ display_name: null, deleted: false }) },
      ),
    ).toBe(welcome);
    expect(
      await googleCallbackPath(
        { code: "c", error: null, next: REVIEW },
        { exchange: async () => true, account: async () => ({ display_name: "Sarah K.", deleted: true }) },
      ),
    ).toBe(welcome);
  });

  it("sends a member to next, never off the platform", async () => {
    expect(
      await googleCallbackPath({ code: "c", error: null, next: REVIEW }, { exchange: async () => true, account: member }),
    ).toBe(REVIEW);
    expect(
      await googleCallbackPath(
        { code: "c", error: null, next: "https://evil.example" },
        { exchange: async () => true, account: member },
      ),
    ).toBe("/platform");
    expect(
      await googleCallbackPath(
        { code: null, error: "access_denied", next: "//evil.example" },
        { exchange: async () => true, account: member },
      ),
    ).toBe("/platform/sign-in?error=google&next=%2Fplatform");
  });
});

describe("GET /platform/auth/callback", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://boltonvouched.example"));

  it("is dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("exchanges the code and redirects (303, absolute on the site URL, private no-store)", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
    rpc.mockResolvedValue({ data: { display_name: "Sarah K.", deleted: false }, error: null });
    // The Host header is never used for the redirect.
    const res = await GET(
      new NextRequest("http://attacker.example/platform/auth/callback?code=abc&next=%2Fplatform%2Fp%2Face%2Freview"),
    );
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(rpc).toHaveBeenCalledWith("my_account");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://boltonvouched.example/platform/p/ace/review");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("lands a refused sign-in on the sign-in page with ?error=google", async () => {
    const res = await GET(
      new NextRequest(
        "http://localhost:3000/platform/auth/callback?error=server_error&error_description=Database+error+saving+new+user&next=%2Fplatform%2Faccount",
      ),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://boltonvouched.example/platform/sign-in?error=google&next=%2Fplatform%2Faccount",
    );
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("treats an exchange error as a failed sign-in", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: "invalid flow state" } });
    const res = await GET(new NextRequest("http://localhost:3000/platform/auth/callback?code=abc"));
    expect(res.headers.get("location")).toBe(
      "https://boltonvouched.example/platform/sign-in?error=google&next=%2Fplatform",
    );
  });
});

describe("googleCallbackPath when the profile lookup fails", () => {
  it("still goes on to next (that page checks the profile), never a 500", async () => {
    expect(
      await googleCallbackPath(
        { code: "c", error: null, next: REVIEW },
        {
          exchange: async () => true,
          account: async () => {
            throw new Error("db down");
          },
        },
      ),
    ).toBe(REVIEW);
  });
});
