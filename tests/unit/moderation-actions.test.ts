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

import {
  checkProof,
  clearReview,
  removeReply,
  removeReview,
  resolveFlag,
} from "@/app/admin/(protected)/reviews/actions";

const REVIEW = "33333333-3333-4333-8333-333333333333";
const FLAG = "44444444-4444-4444-8444-444444444444";
const PROOF = "55555555-5555-4555-8555-555555555555";
const REPLY = "66666666-6666-4666-8666-666666666666";

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

describe("removeReview", () => {
  it("needs a reason, and calls nothing without one", async () => {
    asAdmin();
    const res = await removeReview({}, form({ review_id: REVIEW, reason: "   " }));
    expect(res.errors).toEqual({ reason: "Enter a reason. It's kept in the audit log." });
    expect(rpc).not.toHaveBeenCalledWith("admin_set_review_status", expect.anything());
  });

  it("removes with the reason and refreshes the provider's public pages and the queues", async () => {
    asAdmin({ data: "ace" });
    const res = await removeReview({}, form({ review_id: REVIEW, reason: "Fake: same household as the provider" }));
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("admin_set_review_status", {
      p_review: REVIEW,
      p_status: "removed",
      p_reason: "Fake: same household as the provider",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/platform/p/[slug]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/platform/p/ace");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/reviews");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/flags");
  });

  it("refuses anyone who isn't an admin", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(removeReview({}, form({ review_id: REVIEW, reason: "x" }))).rejects.toThrow("REDIRECT /admin/login");
  });

  it("shows a plain message when the database refuses", async () => {
    asAdmin({ error: { message: "transition not allowed" } });
    const res = await removeReview({}, form({ review_id: REVIEW, reason: "x" }));
    expect(res.message).toBe("That review has already been dealt with. Refresh the page.");
  });
});

describe("clearReview", () => {
  it("clears the check", async () => {
    asAdmin({ data: "ace" });
    const res = await clearReview({}, form({ review_id: REVIEW }));
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("admin_set_review_status", {
      p_review: REVIEW,
      p_status: "published",
      p_reason: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/platform/p/ace");
  });
});

describe("resolveFlag, checkProof, removeReply", () => {
  it("resolves or dismisses a flag", async () => {
    asAdmin();
    await resolveFlag({}, form({ flag_id: FLAG, outcome: "dismissed", note: "Fair comment" }));
    expect(rpc).toHaveBeenCalledWith("admin_resolve_flag", {
      p_flag: FLAG,
      p_outcome: "dismissed",
      p_note: "Fair comment",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/flags");
    const bad = await resolveFlag({}, form({ flag_id: FLAG, outcome: "maybe" }));
    expect(bad.ok).toBeFalsy();
  });

  it("resolves every flag on one review in one go (one card per review)", async () => {
    asAdmin();
    const FLAG2 = "77777777-7777-4777-8777-777777777777";
    const fd = form({ outcome: "resolved", note: "Checked: real customers" });
    fd.append("flag_id", FLAG);
    fd.append("flag_id", FLAG2);
    const res = await resolveFlag({}, fd);
    expect(res).toMatchObject({ ok: true, message: "2 flags resolved." });
    expect(rpc).toHaveBeenCalledWith("admin_resolve_flag", { p_flag: FLAG, p_outcome: "resolved", p_note: "Checked: real customers" });
    expect(rpc).toHaveBeenCalledWith("admin_resolve_flag", { p_flag: FLAG2, p_outcome: "resolved", p_note: "Checked: real customers" });
    const bad = new FormData();
    bad.append("flag_id", FLAG);
    bad.append("flag_id", "nope");
    bad.append("outcome", "resolved");
    rpc.mockClear();
    expect((await resolveFlag({}, bad)).ok).toBeFalsy();
    expect(rpc).not.toHaveBeenCalledWith("admin_resolve_flag", expect.anything());
  });

  it("accepts a proof and refreshes the profile (Verified job)", async () => {
    asAdmin({ data: "ace" });
    const res = await checkProof({}, form({ proof_id: PROOF, outcome: "accepted" }));
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("admin_check_proof", { p_proof: PROOF, p_outcome: "accepted", p_note: null });
    expect(revalidatePath).toHaveBeenCalledWith("/platform/p/ace");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/proofs");
  });

  it("needs a note to reject a proof", async () => {
    asAdmin();
    const res = await checkProof({}, form({ proof_id: PROOF, outcome: "rejected", note: "" }));
    expect(res.errors?.note).toBe("Say why, so you remember later.");
  });

  it("removes a reply with a reason", async () => {
    asAdmin({ data: "ace" });
    expect((await removeReply({}, form({ reply_id: REPLY, reason: "" }))).errors?.reason).toBeTruthy();
    const res = await removeReply({}, form({ reply_id: REPLY, reason: "Abusive" }));
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("admin_remove_reply", { p_reply: REPLY, p_reason: "Abusive" });
  });
});
