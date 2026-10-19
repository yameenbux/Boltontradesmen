import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = { getUser: vi.fn(), signOut: vi.fn() };
const rpc = vi.fn();
const deleteUser = vi.fn();
const calls: string[] = [];
vi.mock("@/lib/supabase/server", () => ({ createServerAuthClient: async () => ({ auth, rpc }) }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ auth: { admin: { deleteUser: (...a: unknown[]) => deleteUser(...a) } } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { deleteAccount } from "@/app/(platform)/account/actions";
import { DELETE_RETRY_MESSAGE } from "@/lib/account-text";

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  calls.length = 0;
  auth.getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } } });
  auth.signOut.mockReset().mockImplementation(async () => {
    calls.push("signOut");
    return { error: null };
  });
  rpc.mockReset().mockImplementation(async (name: string) => {
    calls.push(name);
    return { data: ["e2e-neat-sparks"], error: null };
  });
  deleteUser.mockReset().mockImplementation(async () => {
    calls.push("deleteUser");
    return { error: null };
  });
  revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("deleteAccount", () => {
  it("needs the confirm box ticked, and touches nothing without it", async () => {
    const res = await deleteAccount({}, form({}));
    expect(res.errors?.confirm).toBe("Tick the box to confirm.");
    expect(rpc).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("takes the reviews down, soft-deletes the sign-in, signs out, refreshes the pages and goes home", async () => {
    await expect(deleteAccount({}, form({ confirm: "on" }))).rejects.toThrow("REDIRECT /account/deleted");
    expect(calls).toEqual(["delete_my_account", "deleteUser", "signOut"]);
    expect(deleteUser).toHaveBeenCalledWith("u1", true);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(revalidatePath).toHaveBeenCalledWith("/p/e2e-neat-sparks");
    // Their community questions and answers came down too.
    expect(revalidatePath).toHaveBeenCalledWith("/ask");
    expect(revalidatePath).toHaveBeenCalledWith("/(platform)/ask/[id]", "page");
  });

  it("asks for a retry when the sign-in can't be deleted after the reviews are down", async () => {
    deleteUser.mockResolvedValue({ error: { message: "boom" } });
    const res = await deleteAccount({}, form({ confirm: "on" }));
    expect(res.message).toBe(DELETE_RETRY_MESSAGE);
    expect(DELETE_RETRY_MESSAGE).toBe(
      "Your reviews are down, but we couldn't finish deleting your account. Please try again.",
    );
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("shows a plain error when the database step fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await deleteAccount({}, form({ confirm: "on" }));
    expect(res.message).toBe("Something went wrong. Nothing was deleted. Please try again.");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("explains that the admin account can't be deleted here", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "admin_account" } });
    const res = await deleteAccount({}, form({ confirm: "on" }));
    expect(res.message).toBe("The admin account can't be deleted from here. Nothing was deleted.");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("sends a signed-out person to sign in", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(deleteAccount({}, form({ confirm: "on" }))).rejects.toThrow(
      "REDIRECT /sign-in?next=%2Faccount",
    );
  });
});
