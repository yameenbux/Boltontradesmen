import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { rows: unknown[]; error: unknown; calls: [string, ...unknown[]][] } = { rows: [], error: null, calls: [] };

vi.mock("@/lib/supabase/server", () => ({
  createPublicClient: () => ({
    from: (table: string) => {
      state.calls.push(["from", table]);
      const b: Record<string, unknown> = {
        select: (c: string) => (state.calls.push(["select", c]), b),
        eq: (c: string, v: unknown) => (state.calls.push(["eq", c, v]), b),
        order: (c: string, o: unknown) => (state.calls.push(["order", c, o]), b),
        limit: (n: number) => (state.calls.push(["limit", n]), b),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: state.rows, error: state.error }),
      };
      return b;
    },
  }),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { listProviderReviews } from "@/lib/reviews";
import { revalidatePublicPages } from "@/lib/revalidate-public";

beforeEach(() => {
  state.rows = [];
  state.error = null;
  state.calls = [];
  revalidatePath.mockClear();
});

describe("listProviderReviews", () => {
  it("reads review_public for the provider, newest first, at most 200, and maps to camelCase", async () => {
    state.rows = [
      {
        id: "r1",
        provider_id: "p1",
        provider_slug: "ace",
        category_name: "Plumber",
        job_month: "2026-09-01",
        value_band: "250-1k",
        on_time: "yes",
        on_price: "slightly_over_explained",
        quality: 4,
        tidy: true,
        use_again: "yes",
        comment: "Great",
        under_check: false,
        reviewer_name: "Pat P.",
        group_member: true,
        verified_job: true,
        reply_body: "Thanks Pat",
        reply_at: "2026-10-02T10:00:00Z",
        created_at: "2026-10-01T10:00:00Z",
        edited_at: null,
      },
    ];
    const list = await listProviderReviews("p1");
    expect(state.calls).toContainEqual(["from", "review_public"]);
    expect(state.calls).toContainEqual(["eq", "provider_id", "p1"]);
    expect(state.calls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(state.calls).toContainEqual(["limit", 200]);
    expect(list).toEqual([
      {
        id: "r1",
        providerId: "p1",
        categoryName: "Plumber",
        jobMonth: "2026-09-01",
        valueBand: "250-1k",
        onTime: "yes",
        onPrice: "slightly_over_explained",
        quality: 4,
        tidy: true,
        useAgain: "yes",
        comment: "Great",
        underCheck: false,
        reviewerName: "Pat P.",
        verifiedJob: true,
        replyBody: "Thanks Pat",
        replyAt: "2026-10-02T10:00:00Z",
        createdAt: "2026-10-01T10:00:00Z",
        editedAt: null,
      },
    ]);
  });

  it("throws on a database error", async () => {
    state.error = { message: "boom" };
    await expect(listProviderReviews("p1")).rejects.toThrow(/boom/);
  });
});

describe("revalidatePublicPages", () => {
  it("revalidates profile, category and home pages, plus the provider's own page when given", () => {
    revalidatePublicPages("ace");
    expect(revalidatePath).toHaveBeenCalledWith("/platform/p/[slug]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/platform/c/[category]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/platform");
    expect(revalidatePath).toHaveBeenCalledWith("/platform/p/ace");
  });

  it("skips the provider page without a slug", () => {
    revalidatePublicPages();
    expect(revalidatePath).toHaveBeenCalledTimes(3);
  });
});
