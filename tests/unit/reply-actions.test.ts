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

import { saveReply } from "@/app/platform/provider/actions";
import { reportReview } from "@/app/platform/report/[reviewId]/actions";

const REVIEW = "33333333-3333-4333-8333-333333333333";
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

beforeEach(() => {
  auth.getUser.mockReset();
  rpc.mockReset();
  revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("saveReply", () => {
  it("posts the reply and refreshes the provider's public profile", async () => {
    signedIn({ data: "e2e-ace-plumbing" });
    const res = await saveReply({}, form({ review_id: REVIEW, body: "Thanks Pat, glad the boiler's behaving." }));
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("provider_reply", {
      p_review: REVIEW,
      p_body: "Thanks Pat, glad the boiler's behaving.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/platform/p/e2e-ace-plumbing");
    expect(revalidatePath).toHaveBeenCalledWith("/platform/provider");
  });

  it("explains a phone number in the reply", async () => {
    signedIn({ error: { message: "reply_has_phone" } });
    const res = await saveReply({}, form({ review_id: REVIEW, body: "Ring 07700 900123" }));
    expect(res.errors?.body).toBe("Please leave phone numbers out of your reply.");
    expect(res.values?.body).toBe("Ring 07700 900123");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("checks length and blanks before the database", async () => {
    signedIn({});
    expect((await saveReply({}, form({ review_id: REVIEW, body: "   " }))).errors?.body).toBe(
      "Write your reply first.",
    );
    expect((await saveReply({}, form({ review_id: REVIEW, body: "a".repeat(401) }))).errors?.body).toBe(
      "Keep your reply to 400 characters.",
    );
    expect(rpc).not.toHaveBeenCalledWith("provider_reply", expect.anything());
  });

  it("sends a signed-out provider to sign in, coming back to their area", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(saveReply({}, form({ review_id: REVIEW, body: "Hi" }))).rejects.toThrow(
      "REDIRECT /platform/sign-in?next=%2Fplatform%2Fprovider",
    );
  });
});

describe("reportReview", () => {
  it("sends the report and thanks the person", async () => {
    signedIn({});
    const res = await reportReview({}, form({ review_id: REVIEW, note: "This isn't a real customer" }));
    expect(rpc).toHaveBeenCalledWith("report_review", { p_review: REVIEW, p_note: "This isn't a real customer" });
    expect(res).toMatchObject({
      ok: true,
      message: "Thanks. We'll look at this review. Reports don't change a review on their own.",
    });
  });

  it("needs a note", async () => {
    signedIn({});
    const res = await reportReview({}, form({ review_id: REVIEW, note: "  " }));
    expect(res.errors?.note).toBe("Tell us what's wrong with it, in up to 500 characters.");
    expect(rpc).not.toHaveBeenCalledWith("report_review", expect.anything());
  });

  it("says plainly when the person has reached the daily report limit", async () => {
    signedIn({ error: { message: "report_limit" } });
    const res = await reportReview({}, form({ review_id: REVIEW, note: "Another" }));
    expect(res.message).toBe(
      "You've sent 10 reports today, which is the most we take from one person in a day. Please try again tomorrow, or email support@ysbdesigns.uk.",
    );
  });

  it("says so when the person already reported it", async () => {
    signedIn({ error: { message: "already_reported" } });
    const res = await reportReview({}, form({ review_id: REVIEW, note: "Again" }));
    expect(res.message).toBe("You've already reported this review. We'll look at it.");
  });

  it("sends a signed-out person to sign in, coming back to the report page", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(reportReview({}, form({ review_id: REVIEW, note: "x" }))).rejects.toThrow(
      `REDIRECT /platform/sign-in?next=%2Fplatform%2Freport%2F${REVIEW}`,
    );
  });
});
