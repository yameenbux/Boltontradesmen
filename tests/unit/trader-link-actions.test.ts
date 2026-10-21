import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const auth = {
  // A session that has passed the authenticator step (lib/admin.ts requireAdmin).
  mfa: { getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: "aal2" } })) },
  getUser: vi.fn(), signOut: vi.fn() };
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerAuthClient: async () => ({ auth, rpc }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { claimTraderLink } from "@/app/(platform)/link/[token]/actions";
import { newTraderLink, unlinkProviderAccount } from "@/app/admin/(protected)/providers/actions";
import { TRADER_LINK_ERRORS } from "@/lib/trader-link";

const TOKEN = "11111111-1111-4111-8111-111111111111";
const PROVIDER = "22222222-2222-4222-8222-222222222222";

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

const MEMBER = {
  user_id: "u1",
  display_name: "Alan A.",
  postcode_district: "BL3",
  group_member: false,
  role: "resident",
  deleted: false,
  created_at: "2026-10-01T00:00:00Z",
  providers: [],
  sign_in_kind: "google",
  email: "alan@example.org",
};

function asMember(claim: { data?: unknown; error?: { message: string } | null }) {
  auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  rpc.mockImplementation(async (name: string) => {
    if (name === "my_account") return { data: MEMBER, error: null };
    if (name === "claim_trader_link") return { data: claim.data ?? null, error: claim.error ?? null };
    return { data: null, error: null };
  });
}

function asAdmin(result: { data?: unknown; error?: { message: string } | null } = {}) {
  auth.getUser.mockResolvedValue({ data: { user: { id: "admin" } } });
  rpc.mockImplementation(async (name: string) => {
    if (name === "is_admin") return { data: true, error: null };
    if (name === "admin_get_provider") return { data: { trader_link_expires_at: "2026-10-26T10:00:00Z" }, error: null };
    return { data: result.data ?? null, error: result.error ?? null };
  });
}

beforeEach(() => {
  auth.getUser.mockReset();
  rpc.mockReset();
  revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://boltonvouched.example");
});
afterEach(() => vi.unstubAllEnvs());

describe("claimTraderLink", () => {
  it("redirects to the provider area on success", async () => {
    asMember({ data: "e2e-ace-plumbing" });
    await expect(claimTraderLink({}, form({ token: TOKEN }))).rejects.toThrow("REDIRECT /provider");
    expect(rpc).toHaveBeenCalledWith("claim_trader_link", { p_token: TOKEN });
  });

  for (const code of [
    "link_invalid",
    "link_used",
    "link_expired",
    "listing_already_linked",
    "account_already_linked",
    "account_not_allowed",
  ] as const) {
    it(`maps ${code} to its copy`, async () => {
      asMember({ error: { message: code } });
      const res = await claimTraderLink({}, form({ token: TOKEN }));
      expect(res.message).toBe(TRADER_LINK_ERRORS[code]);
      expect(res.ok).toBeFalsy();
    });
  }

  it("has the agreed copy", () => {
    expect(TRADER_LINK_ERRORS).toEqual({
      link_invalid: "This link isn't valid. Ask us for a new one.",
      link_used: "This link has already been used. If that wasn't you, contact us.",
      link_expired: "This link has expired. Ask us for a new one.",
      listing_already_linked: "This listing is already linked to an account. If that's not you, contact us.",
      account_already_linked:
        "Your account is already linked to another listing. Sign in with a different account, or contact us.",
      account_not_allowed: "This account can't be linked to a listing.",
    });
  });

  it("refuses a malformed token without calling the database", async () => {
    asMember({ data: "x" });
    const res = await claimTraderLink({}, form({ token: "not-a-uuid" }));
    expect(res.message).toBe(TRADER_LINK_ERRORS.link_invalid);
    expect(rpc).not.toHaveBeenCalledWith("claim_trader_link", expect.anything());
  });

  it("shows a general error for anything unexpected", async () => {
    asMember({ error: { message: "boom" } });
    const res = await claimTraderLink({}, form({ token: TOKEN }));
    expect(res.message).toBe("Something went wrong. Please try again.");
  });

  it("sends a signed-out person to sign in, coming back to the link", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(claimTraderLink({}, form({ token: TOKEN }))).rejects.toThrow(
      `REDIRECT /sign-in?next=${encodeURIComponent(`/link/${TOKEN}`)}`,
    );
  });
});

describe("newTraderLink", () => {
  it("returns an absolute link on the site URL, with its expiry", async () => {
    asAdmin({ data: { token: TOKEN, expires_at: "2026-10-26T10:00:00Z" } });
    const res = await newTraderLink(PROVIDER);
    expect(res).toEqual({ url: `https://boltonvouched.example/link/${TOKEN}`, expires: "26 October 2026" });
    expect(rpc).toHaveBeenCalledWith("admin_new_trader_link", { p_provider: PROVIDER });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/providers/${PROVIDER}`);
  });

  it("rejects a non-uuid id without calling the database", async () => {
    asAdmin();
    const res = await newTraderLink("nope");
    expect(res.error).toBeTruthy();
    expect(res.url).toBeUndefined();
    expect(rpc).not.toHaveBeenCalledWith("admin_new_trader_link", expect.anything());
  });

  it("explains an already linked listing", async () => {
    asAdmin({ error: { message: "listing_already_linked" } });
    const res = await newTraderLink(PROVIDER);
    expect(res.error).toBe("This listing is already linked to an account. Unlink it first.");
  });

  it("explains a listing that can't be linked yet", async () => {
    asAdmin({ error: { message: "provider not linkable" } });
    const res = await newTraderLink(PROVIDER);
    expect(res.error).toBe("A trader link is only available once the provider has agreed to be listed.");
  });
});

describe("unlinkProviderAccount", () => {
  it("needs a reason", async () => {
    asAdmin();
    const res = await unlinkProviderAccount({}, form({ provider_id: PROVIDER, reason: "  " }));
    expect(res.errors?.reason).toBe("Enter a reason. It's kept in the audit log.");
    expect(rpc).not.toHaveBeenCalledWith("admin_unlink_provider", expect.anything());
  });

  it("unlinks with the reason", async () => {
    asAdmin();
    const res = await unlinkProviderAccount({}, form({ provider_id: PROVIDER, reason: "Wrong person" }));
    expect(rpc).toHaveBeenCalledWith("admin_unlink_provider", { p_provider: PROVIDER, p_reason: "Wrong person" });
    expect(res.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/providers/${PROVIDER}`);
  });
});
