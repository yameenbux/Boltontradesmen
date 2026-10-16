import { beforeEach, describe, expect, it, vi } from "vitest";

const state: { user: { id: string } | null; throws: boolean; made: number; setAll: unknown } = {
  user: null,
  throws: false,
  made: 0,
  setAll: null,
};

vi.mock("@supabase/ssr", async (orig) => {
  const real = await orig<typeof import("@supabase/ssr")>();
  return {
    ...real,
    createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: unknown } }) => {
      state.made++;
      state.setAll = opts.cookies.setAll;
      return {
        auth: {
          getUser: async () => {
            if (state.throws) throw new Error("auth down");
            return { data: { user: state.user } };
          },
        },
      };
    },
  };
});

import { tapActor } from "@/lib/tap-actor";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  state.user = { id: "00000000-0000-0000-0000-0000000000aa" };
  state.throws = false;
  state.made = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("tapActor", () => {
  it("is null with no cookies, or no session cookie, without asking auth", async () => {
    expect(await tapActor(null)).toBeNull();
    expect(await tapActor("theme=dark; other=1")).toBeNull();
    expect(state.made).toBe(0);
  });

  it("returns the signed-in user's id from the session cookie (also when split into chunks)", async () => {
    expect(await tapActor("sb-127-auth-token=base64-abc")).toBe("00000000-0000-0000-0000-0000000000aa");
    expect(await tapActor("x=1; sb-abcd-auth-token.0=one; sb-abcd-auth-token.1=two")).toBe(
      "00000000-0000-0000-0000-0000000000aa",
    );
  });

  it("never writes a cookie", async () => {
    await tapActor("sb-127-auth-token=base64-abc");
    expect(typeof state.setAll).toBe("function");
    expect((state.setAll as () => unknown)()).toBeUndefined();
  });

  it("is null when the session is no good, or auth fails", async () => {
    state.user = null;
    expect(await tapActor("sb-127-auth-token=stale")).toBeNull();
    state.throws = true;
    expect(await tapActor("sb-127-auth-token=stale")).toBeNull();
  });
});
