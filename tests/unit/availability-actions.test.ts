import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = { getUser: vi.fn() };
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerAuthClient: async () => ({ auth, rpc }) }));
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ supabase: { rpc }, user: { id: "admin" } }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { setMyAvailability } from "@/app/platform/provider/actions";
import { setProviderAvailability } from "@/app/admin/(protected)/providers/actions";
import { addDays, endOfWeek, londonToday } from "@/lib/availability";

const ACCOUNT = {
  user_id: "u1",
  display_name: "Alan A.",
  postcode_district: "BL1",
  group_member: false,
  role: "provider",
  deleted: false,
  created_at: "2026-10-12T09:00:00Z",
  providers: [{ id: "p1", slug: "e2e-ace-plumbing", business_name: "Ace Plumbing", status: "live" }],
};
const PID = "11111111-1111-4111-8111-111111111111";
const today = londonToday();

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
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

describe("setMyAvailability (the trader)", () => {
  it("sets Taking on work and refreshes the trader's public pages", async () => {
    signedIn({ data: ["e2e-ace-plumbing"] });
    const res = await setMyAvailability({}, form({ choice: "taking" }));
    expect(res).toMatchObject({ ok: true, message: "Saved. It's on your page now." });
    expect(calls("set_my_availability")).toEqual([{ p_status: "taking", p_until: null }]);
    expect(revalidatePath).toHaveBeenCalledWith("/platform/p/e2e-ace-plumbing");
    expect(revalidatePath).toHaveBeenCalledWith("/platform/c/[category]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/platform/provider");
  });

  it("this week is the Sunday that ends this week in Bolton", async () => {
    signedIn({ data: ["e2e-ace-plumbing"] });
    await setMyAvailability({}, form({ choice: "taking", this_week: "on" }));
    expect(calls("set_my_availability")).toEqual([{ p_status: "taking", p_until: endOfWeek(today) }]);
  });

  it("Booked up until a date, and clearing it", async () => {
    signedIn({ data: ["e2e-ace-plumbing"] });
    const until = addDays(today, 30);
    await setMyAvailability({}, form({ choice: "booked", until, this_week: "on" }));
    const cleared = await setMyAvailability({}, form({ choice: "none", until }));
    expect(calls("set_my_availability")).toEqual([
      { p_status: "booked", p_until: until },
      { p_status: null, p_until: null },
    ]);
    expect(cleared.message).toBe("Cleared. Your page doesn't show availability now.");
  });

  it("checks the date before asking the database", async () => {
    signedIn({});
    expect((await setMyAvailability({}, form({ choice: "booked", until: today }))).errors).toEqual({
      until: "Choose a date after today.",
    });
    expect((await setMyAvailability({}, form({ choice: "booked", until: addDays(today, 200) }))).errors).toEqual({
      until: "Choose a date no more than 6 months ahead.",
    });
    expect((await setMyAvailability({}, form({ choice: "booked" }))).errors).toEqual({
      until: "Choose the date you're booked up until.",
    });
    expect((await setMyAvailability({}, form({ choice: "maybe" }))).errors).toEqual({ choice: "Choose one." });
    expect(calls("set_my_availability")).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("explains the database's refusals and keeps the form filled", async () => {
    signedIn({ error: { message: "not_your_listing" } });
    const res = await setMyAvailability({}, form({ choice: "taking" }));
    expect(res.ok).toBeUndefined();
    expect(res.message).toBe("Your listing isn't live or paused, so availability can't be set.");
    expect(res.values).toMatchObject({ choice: "taking" });
    expect(revalidatePath).not.toHaveBeenCalled();

    signedIn({ error: { message: "boom" } });
    expect((await setMyAvailability({}, form({ choice: "taking" }))).message).toBe("Something went wrong. Please try again.");
  });

  it("sends someone signed out to sign in", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(setMyAvailability({}, form({ choice: "taking" }))).rejects.toThrow(/REDIRECT \/platform\/sign-in/);
    expect(calls("set_my_availability")).toEqual([]);
  });
});

describe("setProviderAvailability (the admin)", () => {
  it("sets any listing's availability and refreshes its public pages", async () => {
    rpc.mockResolvedValue({ data: "e2e-ace-plumbing", error: null });
    const until = addDays(today, 10);
    const res = await setProviderAvailability({}, form({ provider_id: PID, choice: "booked", until }));
    expect(res).toMatchObject({ ok: true, message: "Availability saved" });
    expect(rpc).toHaveBeenCalledWith("admin_set_availability", { p_provider: PID, p_status: "booked", p_until: until });
    expect(revalidatePath).toHaveBeenCalledWith("/platform/p/e2e-ace-plumbing");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/providers/${PID}`);
  });

  it("clears it", async () => {
    rpc.mockResolvedValue({ data: "e2e-ace-plumbing", error: null });
    const res = await setProviderAvailability({}, form({ provider_id: PID, choice: "none" }));
    expect(res.message).toBe("Availability cleared");
    expect(rpc).toHaveBeenCalledWith("admin_set_availability", { p_provider: PID, p_status: null, p_until: null });
  });

  it("refuses an unknown provider or a removed listing", async () => {
    expect((await setProviderAvailability({}, form({ provider_id: "nope", choice: "taking" }))).message).toBe("Unknown provider");
    rpc.mockResolvedValue({ data: null, error: { message: "provider removed" } });
    expect((await setProviderAvailability({}, form({ provider_id: PID, choice: "taking" }))).message).toBe(
      "A removed listing can't show availability.",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
