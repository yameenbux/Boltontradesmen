import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = {
  // A session that has passed the authenticator step (lib/admin.ts requireAdmin).
  mfa: { getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: "aal2" } })) },
  getUser: vi.fn() };
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerAuthClient: async () => ({ auth, rpc }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
const storageRemove = vi.fn();
const storageFrom = vi.fn(() => ({ remove: storageRemove }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ storage: { from: storageFrom } }) }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import {
  approveReview,
  checkProof,
  clearReview,
  deleteDueProofFiles,
  removeReply,
  removeReview,
  resolveFlag,
  tidySignInRecords,
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
    expect(revalidatePath).toHaveBeenCalledWith("/(platform)/p/[slug]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/p/ace");
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

describe("approveReview", () => {
  it("approves a held review and revalidates the provider's page", async () => {
    asAdmin({ data: "ace" });
    const res = await approveReview({}, form({ review_id: REVIEW }));
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("admin_set_review_status", {
      p_review: REVIEW,
      p_status: "published",
      p_reason: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/p/ace");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/reviews");
  });

  it("refuses a bad id without calling the database", async () => {
    asAdmin();
    const res = await approveReview({}, form({ review_id: "nope" }));
    expect(res.ok).toBeFalsy();
    expect(rpc).not.toHaveBeenCalledWith("admin_set_review_status", expect.anything());
  });

  it("says plainly when it was already dealt with", async () => {
    asAdmin({ error: { message: "transition not allowed" } });
    const res = await approveReview({}, form({ review_id: REVIEW }));
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
    expect(revalidatePath).toHaveBeenCalledWith("/p/ace");
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
    expect(revalidatePath).toHaveBeenCalledWith("/p/ace");
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

describe("deleteDueProofFiles (proof files deleted 12 months after the check)", () => {
  function admin(due: { id: string; storage_path: string }[], marked = due.length) {
    auth.getUser.mockResolvedValue({ data: { user: { id: "admin" } } });
    let listed = false;
    rpc.mockImplementation(async (name: string) => {
      if (name === "is_admin") return { data: true, error: null };
      if (name === "proof_files_due") {
        const rows = listed ? [] : due;
        listed = true;
        return { data: rows, error: null };
      }
      if (name === "mark_proof_files_deleted") return { data: marked, error: null };
      return { data: null, error: null };
    });
  }

  beforeEach(() => {
    storageRemove.mockReset().mockResolvedValue({ data: [], error: null });
    storageFrom.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("says so when nothing is due, without touching Storage", async () => {
    admin([]);
    const res = await deleteDueProofFiles({}, new FormData());
    expect(res).toEqual({ ok: true, message: "No proof files are due for deletion." });
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it("deletes the due files from the private bucket, then marks them", async () => {
    admin([
      { id: PROOF, storage_path: `${REVIEW}/a.jpg` },
      { id: FLAG, storage_path: `${REVIEW}/b.pdf` },
    ]);
    const res = await deleteDueProofFiles({}, new FormData());
    expect(storageFrom).toHaveBeenCalledWith("review-proofs");
    expect(storageRemove).toHaveBeenCalledWith([`${REVIEW}/a.jpg`, `${REVIEW}/b.pdf`]);
    expect(rpc).toHaveBeenCalledWith("mark_proof_files_deleted", { p_ids: [PROOF, FLAG] });
    expect(res).toEqual({ ok: true, message: "Deleted 2 proof files checked over 12 months ago." });
  });

  it("uses the singular for one file", async () => {
    admin([{ id: PROOF, storage_path: `${REVIEW}/a.jpg` }]);
    expect((await deleteDueProofFiles({}, new FormData())).message).toBe("Deleted 1 proof file checked over 12 months ago.");
  });

  it("gives a plain message when Storage refuses, and marks nothing", async () => {
    admin([{ id: PROOF, storage_path: `${REVIEW}/a.jpg` }]);
    storageRemove.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await deleteDueProofFiles({}, new FormData());
    expect(res).toEqual({ message: "Something went wrong. Please try again." });
    expect(rpc).not.toHaveBeenCalledWith("mark_proof_files_deleted", expect.anything());
  });

  it("is for the admin only", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(deleteDueProofFiles({}, new FormData())).rejects.toThrow("REDIRECT /admin/login");
    expect(storageRemove).not.toHaveBeenCalled();
  });
});

describe("tidySignInRecords (privacy notice: sign-in records 30 days, unused accounts 24 hours)", () => {
  it("runs the database tidy and says what went", async () => {
    asAdmin({ data: { email_requests: 3, phone_requests: 0, code_attempts: 2, unused_accounts: 1 } });
    const res = await tidySignInRecords({}, form({}));
    expect(rpc).toHaveBeenCalledWith("tidy_sign_in_records");
    expect(res).toEqual({
      ok: true,
      message: "Deleted 5 sign-in records over 30 days old and 1 unused account over 24 hours old.",
    });
  });

  it("mentions listing requests over 90 days old when it deleted some", async () => {
    asAdmin({ data: { email_requests: 0, phone_requests: 0, code_attempts: 0, unused_accounts: 0, listing_requests: 2 } });
    const res = await tidySignInRecords({}, form({}));
    expect(res).toEqual({
      ok: true,
      message:
        "Deleted 0 sign-in records over 30 days old and 0 unused accounts over 24 hours old. Also deleted 2 listing requests over 90 days old.",
    });
  });

  it("says so when there was nothing to delete", async () => {
    asAdmin({ data: { email_requests: 0, phone_requests: 0, code_attempts: 0, unused_accounts: 0 } });
    const res = await tidySignInRecords({}, form({}));
    expect(res).toEqual({ ok: true, message: "Nothing to tidy: no sign-in records are due for deletion." });
  });

  it("shows a general error when the database refuses", async () => {
    asAdmin({ error: { message: "boom" } });
    const res = await tidySignInRecords({}, form({}));
    expect(res).toEqual({ message: "Something went wrong. Please try again." });
  });
});
