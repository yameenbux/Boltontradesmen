import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = { getUser: vi.fn() };
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerAuthClient: async () => ({ auth, rpc }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { setRequestStatus } from "@/app/admin/(protected)/requests/actions";

const REQUEST = "77777777-7777-4777-8777-777777777777";

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

function asAdmin(result: { data?: unknown; error?: unknown } = {}) {
  auth.getUser.mockResolvedValue({ data: { user: { id: "admin" } } });
  rpc.mockImplementation(async (name: string) =>
    name === "is_admin" ? { data: true, error: null } : { data: result.data ?? null, error: result.error ?? null },
  );
}

beforeEach(() => {
  auth.getUser.mockReset();
  rpc.mockReset();
  revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setRequestStatus", () => {
  it("sends anyone who isn't the admin to the login page", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(setRequestStatus({}, form({ request_id: REQUEST, status: "done" }))).rejects.toThrow(
      "REDIRECT /admin/login",
    );
  });

  it("marks a request done and refreshes the queue", async () => {
    asAdmin();
    const res = await setRequestStatus({}, form({ request_id: REQUEST, status: "done" }));
    expect(rpc).toHaveBeenCalledWith("admin_set_listing_request_status", { p_id: REQUEST, p_status: "done" });
    expect(res).toEqual({ ok: true, message: "Marked done." });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/requests");
  });

  it("refuses a bad id or status without calling the database", async () => {
    asAdmin();
    for (const entries of [{ request_id: "nope", status: "done" }, { request_id: REQUEST, status: "deleted" }]) {
      expect(await setRequestStatus({}, form(entries))).toEqual({ message: "Something went wrong. Please try again." });
    }
    expect(rpc).not.toHaveBeenCalledWith("admin_set_listing_request_status", expect.anything());
  });

  it("explains a request that has gone", async () => {
    asAdmin({ error: { message: "listing request not found" } });
    const res = await setRequestStatus({}, form({ request_id: REQUEST, status: "spam" }));
    expect(res.message).toMatch(/That request has gone/);
  });
});
