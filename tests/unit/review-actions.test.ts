import { describe, it, expect, vi, beforeEach } from "vitest";

const auth = { getUser: vi.fn() };
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerAuthClient: async () => ({ auth, rpc }) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1", "user-agent": "Test/1" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
const storageUpload = vi.fn();
const storageRemove = vi.fn();
const storageFrom = vi.fn(() => ({ upload: storageUpload, remove: storageRemove }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ storage: { from: storageFrom } }) }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { editReview, submitReview } from "@/app/platform/p/[slug]/review/actions";
import { deviceHash } from "@/lib/device-hash";
import sharp from "sharp";

const ACCOUNT = {
  user_id: "u1",
  display_name: "Sarah K.",
  postcode_district: "BL3",
  group_member: false,
  role: "resident",
  deleted: false,
  created_at: "2026-10-12T09:00:00Z",
  providers: [],
};
const PROVIDER = "22222222-2222-4222-8222-222222222222";
const CAT = "11111111-1111-4111-8111-111111111111";
const REVIEW = "33333333-3333-4333-8333-333333333333";

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}
const answers = {
  slug: "ace",
  provider_id: PROVIDER,
  category_id: CAT,
  job_month: "2026-09",
  value_band: "<250",
  on_time: "late_informed",
  on_price: "yes",
  quality: "5",
  use_again: "maybe",
  comment: "Good",
};

function signedIn(result: { data?: unknown; error?: unknown }) {
  auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  rpc.mockImplementation(async (name: string) =>
    name === "my_account" ? { data: ACCOUNT, error: null } : { data: result.data ?? null, error: result.error ?? null },
  );
}

beforeEach(() => {
  process.env.DEVICE_HASH_SECRET = "test-secret";
  auth.getUser.mockReset();
  rpc.mockReset();
  revalidatePath.mockClear();
  storageUpload.mockReset().mockResolvedValue({ error: null });
  storageRemove.mockReset().mockResolvedValue({ error: null });
  storageFrom.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submitReview", () => {
  it("posts through submit_review with the device hash and reports the status", async () => {
    signedIn({ data: { id: REVIEW, status: "under_check" } });
    const res = await submitReview({}, form(answers));
    expect(res).toMatchObject({ ok: true, status: "under_check", reviewId: REVIEW });
    expect(rpc).toHaveBeenCalledWith("submit_review", {
      p: {
        provider_id: PROVIDER,
        category_id: CAT,
        job_month: "2026-09-01",
        value_band: "<250",
        on_time: "late_informed",
        on_price: "yes",
        quality: 5,
        tidy: null,
        use_again: "maybe",
        comment: "Good",
      },
      p_device_hash: deviceHash("9.9.9.9", "Test/1"),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/platform/p/ace");
    expect(revalidatePath).toHaveBeenCalledWith("/platform/account");
  });

  it("shows the already-reviewed copy for a double tap (Review Focus 3)", async () => {
    signedIn({ error: { message: "already_reviewed", code: "P0001" } });
    const res = await submitReview({}, form(answers));
    expect(res.ok).toBeFalsy();
    expect(res.error).toBe("You've already reviewed this provider. You can edit your review instead.");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("puts a field's database error next to that field", async () => {
    signedIn({ error: { message: "comment_has_phone", code: "P0001" } });
    const res = await submitReview({}, form(answers));
    expect(res.errors).toEqual({ comment: "Please leave phone numbers out of your review." });
  });

  it("does not call the database when answers are missing", async () => {
    signedIn({});
    const res = await submitReview({}, form({ slug: "ace", provider_id: PROVIDER, comment: "" }));
    expect(res.errors?.on_time).toBeTruthy();
    expect(rpc).not.toHaveBeenCalledWith("submit_review", expect.anything());
  });

  it("marks a missing tidy answer when the trade asks it", async () => {
    signedIn({});
    const res = await submitReview({}, form({ ...answers, asks_tidy: "1" }));
    expect(res.errors).toEqual({ tidy: "Tell us whether they left the place tidy." });
    expect(rpc).not.toHaveBeenCalledWith("submit_review", expect.anything());
  });

  it("sends a signed-out person to sign in, coming back to the form", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(submitReview({}, form(answers))).rejects.toThrow(
      "REDIRECT /platform/sign-in?next=%2Fplatform%2Fp%2Face%2Freview",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("editReview", () => {
  it("saves through edit_review and refreshes the profile", async () => {
    signedIn({ data: { id: REVIEW, status: "published" } });
    const res = await editReview({}, form({ ...answers, review_id: REVIEW }));
    expect(res).toMatchObject({ ok: true, status: "published" });
    expect(rpc).toHaveBeenCalledWith(
      "edit_review",
      expect.objectContaining({ p_id: REVIEW, p_device_hash: deviceHash("9.9.9.9", "Test/1") }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/platform/p/ace");
  });

  it("explains a closed edit window", async () => {
    signedIn({ error: { message: "edit_window_closed", code: "P0001" } });
    const res = await editReview({}, form({ ...answers, review_id: REVIEW }));
    expect(res.error).toBe("Reviews can only be edited for 14 days after posting.");
  });
});

describe("proof upload after posting", () => {
  async function jpeg() {
    return sharp({ create: { width: 4, height: 4, channels: 3, background: "#ffffff" } })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "53/1 34/1 0/1" } })
      .toBuffer();
  }
  function withProof(file: File) {
    const fd = form(answers);
    fd.append("proof", file);
    return fd;
  }

  it("strips the photo, uploads it privately and records it against the new review", async () => {
    signedIn({ data: { id: REVIEW, status: "published" } });
    const res = await submitReview({}, withProof(new File([await jpeg()], "IMG_0001.jpg", { type: "image/jpeg" })));
    expect(res).toMatchObject({ ok: true, status: "published" });
    expect(res.proofError).toBeUndefined();
    expect(storageFrom).toHaveBeenCalledWith("review-proofs");
    const [path, body, opts] = storageUpload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${REVIEW}/[0-9a-f-]{36}\\.jpg$`));
    expect((await sharp(body).metadata()).exif).toBeUndefined();
    expect(opts).toEqual({ contentType: "image/jpeg", upsert: false });
    expect(rpc).toHaveBeenCalledWith("add_review_proof", { p_review: REVIEW, p_path: path, p_mime: "image/jpeg" });
  });

  it("keeps the review posted when the file is not a photo or PDF", async () => {
    signedIn({ data: { id: REVIEW, status: "published" } });
    const res = await submitReview({}, withProof(new File(["ftypheic....."], "IMG_0002.HEIC", { type: "image/heic" })));
    expect(res).toMatchObject({ ok: true, status: "published" });
    expect(res.proofError).toBe(
      "Your review is posted, but the proof didn't upload: Please upload a photo (JPEG, PNG or WebP) or a PDF. You can add it by editing your review within 14 days.",
    );
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("removes the uploaded file when the database refuses the proof", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpc.mockImplementation(async (name: string) => {
      if (name === "my_account") return { data: ACCOUNT, error: null };
      if (name === "add_review_proof") return { data: null, error: { message: "proof_exists" } };
      return { data: { id: REVIEW, status: "published" }, error: null };
    });
    const res = await submitReview({}, withProof(new File([await jpeg()], "a.jpg", { type: "image/jpeg" })));
    expect(res.ok).toBe(true);
    expect(res.proofError).toMatch(/^Your review is posted, but the proof didn't upload: /);
    expect(storageRemove).toHaveBeenCalledWith([storageUpload.mock.calls[0][0]]);
  });

  it("ignores an empty file input", async () => {
    signedIn({ data: { id: REVIEW, status: "published" } });
    const res = await submitReview({}, withProof(new File([], "", { type: "application/octet-stream" })));
    expect(res.proofError).toBeUndefined();
    expect(storageUpload).not.toHaveBeenCalled();
  });
});
