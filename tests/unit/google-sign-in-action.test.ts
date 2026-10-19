import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const auth = { signInWithOAuth: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({ createServerAuthClient: async () => ({ auth, rpc: vi.fn() }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: vi.fn() }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { startGoogleSignIn } from "@/app/platform/sign-in/actions";

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  auth.signInWithOAuth.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("startGoogleSignIn", () => {
  it("starts Google OAuth (PKCE) with a callback on the site URL and redirects to Google", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/o/oauth2/auth?x=1" }, error: null });
    await expect(startGoogleSignIn(form({ next: "/platform/account" }))).rejects.toThrow(
      "REDIRECT https://accounts.google.com/o/oauth2/auth?x=1",
    );
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/platform/auth/callback?next=%2Fplatform%2Faccount",
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("never carries a crafted next", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/x" }, error: null });
    await expect(startGoogleSignIn(form({ next: "https://evil.example" }))).rejects.toThrow("REDIRECT");
    expect(auth.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe(
      "http://localhost:3000/platform/auth/callback?next=%2Fplatform",
    );
  });

  it("sends an error back to the sign-in page with the Google copy", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: "provider is not enabled" } });
    await expect(startGoogleSignIn(form({ next: "/platform/p/ace/review" }))).rejects.toThrow(
      "REDIRECT /platform/sign-in?error=google&next=%2Fplatform%2Fp%2Face%2Freview",
    );
  });

  it("treats a missing URL as an error", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });
    await expect(startGoogleSignIn(form({}))).rejects.toThrow(
      "REDIRECT /platform/sign-in?error=google&next=%2Fplatform",
    );
  });
});
