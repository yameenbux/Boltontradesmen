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

import { pauseMyListing, saveMyListing, unpauseMyListing, withdrawMyListing } from "@/app/(platform)/provider/actions";
import { LISTING_ERRORS } from "@/lib/listing-edit";

const ACCOUNT = {
  user_id: "u1",
  display_name: "Alan A.",
  postcode_district: "BL1",
  role: "provider",
  deleted: false,
  created_at: "2026-10-12T09:00:00Z",
  providers: [{ id: "p1", slug: "e2e-ace-plumbing", business_name: "Ace Plumbing", status: "live" }],
};
const PID = "11111111-1111-4111-8111-111111111111";

function form(entries: [string, string][]) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}
function signedIn(result: { data?: unknown; error?: unknown }) {
  auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  rpc.mockImplementation(async (name: string) =>
    name === "my_account" ? { data: ACCOUNT, error: null } : { data: result.data ?? null, error: result.error ?? null },
  );
}
const calls = (name: string) => rpc.mock.calls.filter(([n]) => n === name).map(([, args]) => args);

beforeEach(() => {
  auth.getUser.mockReset();
  rpc.mockReset();
  revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("saveMyListing", () => {
  it("saves the bio and areas and refreshes the public pages for that slug", async () => {
    signedIn({ data: "e2e-ace-plumbing" });
    const res = await saveMyListing({}, form([["provider_id", PID], ["bio", " Leaks fixed. "], ["areas", "BL3"], ["areas", "BL1"]]));
    expect(res).toMatchObject({ ok: true, message: "Saved. It's on your page now." });
    expect(calls("update_my_listing")).toEqual([{ p_provider: PID, p_bio: "Leaks fixed.", p_areas: ["BL1", "BL3"] }]);
    expect(revalidatePath).toHaveBeenCalledWith("/p/e2e-ace-plumbing");
    expect(revalidatePath).toHaveBeenCalledWith("/(platform)/c/[category]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/provider");
  });

  it("checks the form before the database, keeping what was typed", async () => {
    signedIn({});
    const res = await saveMyListing({}, form([["provider_id", PID], ["bio", "Ring 07700 900123"]]));
    expect(res.errors).toEqual({ bio: LISTING_ERRORS.bio_has_phone.message, areas: LISTING_ERRORS.areas_required.message });
    expect(res.values).toEqual({ bio: "Ring 07700 900123", areas: [] });
    expect(calls("update_my_listing")).toEqual([]);
  });

  it("shows the database's refusal in words", async () => {
    signedIn({ error: { message: "blocked" } });
    const res = await saveMyListing({}, form([["provider_id", PID], ["bio", "Hi"], ["areas", "BL1"]]));
    expect(res.message).toBe(LISTING_ERRORS.blocked.message);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("an unknown error is a general message, logged", async () => {
    signedIn({ error: { message: "boom" } });
    const res = await saveMyListing({}, form([["provider_id", PID], ["bio", "Hi"], ["areas", "BL1"]]));
    expect(res.message).toBe("Something went wrong. Please try again.");
    expect(console.error).toHaveBeenCalled();
  });

  it("refuses a bad listing id without asking the database", async () => {
    signedIn({});
    const res = await saveMyListing({}, form([["provider_id", "nope"], ["bio", "Hi"], ["areas", "BL1"]]));
    expect(res.message).toBe("Something went wrong. Please try again.");
    expect(calls("update_my_listing")).toEqual([]);
  });
});

describe("pause, unpause and withdraw", () => {
  it("pauses and refreshes the pages", async () => {
    signedIn({ data: "e2e-ace-plumbing" });
    const res = await pauseMyListing({}, form([["provider_id", PID]]));
    expect(res).toMatchObject({ ok: true });
    expect(calls("pause_my_listing")).toEqual([{ p_provider: PID }]);
    expect(revalidatePath).toHaveBeenCalledWith("/p/e2e-ace-plumbing");
  });

  it("explains an admin's pause can't be undone here", async () => {
    signedIn({ error: { message: "paused_by_admin" } });
    const res = await unpauseMyListing({}, form([["provider_id", PID]]));
    expect(res.message).toBe(LISTING_ERRORS.paused_by_admin.message);
  });

  it("withdraw needs the box ticked", async () => {
    signedIn({ data: "e2e-ace-plumbing" });
    const res = await withdrawMyListing({}, form([["provider_id", PID]]));
    expect(res.errors?.confirm).toMatch(/Tick the box/);
    expect(calls("withdraw_my_listing")).toEqual([]);
  });

  it("withdraws, refreshes the pages and goes to the withdrawn page", async () => {
    signedIn({ data: "e2e-ace-plumbing" });
    await expect(withdrawMyListing({}, form([["provider_id", PID], ["confirm", "on"]]))).rejects.toThrow(
      "REDIRECT /provider?withdrawn=1",
    );
    expect(calls("withdraw_my_listing")).toEqual([{ p_provider: PID }]);
    expect(revalidatePath).toHaveBeenCalledWith("/p/e2e-ace-plumbing");
  });
});
