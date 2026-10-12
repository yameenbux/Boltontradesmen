import { describe, it, expect, vi, beforeEach } from "vitest";

const state: {
  rows: unknown[];
  error: unknown;
  contains: unknown[][];
  tables: Record<string, unknown[]>;
  selects: [string, string][];
} = { rows: [], error: null, contains: [], tables: {}, selects: [] };

vi.mock("@/lib/supabase/server", () => ({
  createPublicClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {
        select: (cols: string) => {
          state.selects.push([table, cols]);
          return builder;
        },
        order: () => builder,
        contains: (col: string, val: unknown) => {
          state.contains.push([col, val]);
          return builder;
        },
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: state.tables[table] ?? state.rows, error: state.error }),
      };
      return builder;
    },
  }),
}));

import { listProvidersInCategory, listCategoryGroups, BL_DISTRICTS } from "@/lib/directory";

const row = (slug: string, o: Record<string, unknown> = {}) => ({
  id: slug,
  slug,
  business_name: slug,
  contact_name: null,
  areas: [],
  bio: null,
  is_verified: false,
  has_whatsapp: false,
  category_slugs: ["plumber"],
  checks: [],
  review_count: 0,
  use_again_pct: null,
  on_time_pct: null,
  on_price_pct: null,
  tidy_pct: null,
  score: null,
  last_review_at: null,
  created_at: "2026-01-01T00:00:00Z",
  ...o,
});

beforeEach(() => {
  state.rows = [];
  state.error = null;
  state.contains = [];
  state.tables = {};
  state.selects = [];
});

describe("listProvidersInCategory", () => {
  it("ranks scored providers by score, then review count, then recency", async () => {
    state.rows = [
      row("low", { score: 3.9, review_count: 9, last_review_at: "2026-09-01T00:00:00Z" }),
      row("tie-old", { score: 4.5, review_count: 5, last_review_at: "2026-01-01T00:00:00Z" }),
      row("tie-new", { score: 4.5, review_count: 5, last_review_at: "2026-08-01T00:00:00Z" }),
      row("tie-more", { score: 4.5, review_count: 8, last_review_at: "2025-01-01T00:00:00Z" }),
      row("top", { score: 4.8, review_count: 3, last_review_at: "2026-02-01T00:00:00Z" }),
    ];
    const { ranked, newcomers } = await listProvidersInCategory("plumber");
    expect(ranked.map((p) => p.slug)).toEqual(["top", "tie-more", "tie-new", "tie-old", "low"]);
    expect(newcomers).toEqual([]);
  });

  it("puts providers with under 3 reviews in newcomers, newest first", async () => {
    state.rows = [
      row("scored", { score: 4, review_count: 4, last_review_at: "2026-05-01T00:00:00Z" }),
      row("old-new", { review_count: 0, created_at: "2026-02-01T00:00:00Z" }),
      row("fresh", { review_count: 2, created_at: "2026-09-01T00:00:00Z" }),
    ];
    const { ranked, newcomers } = await listProvidersInCategory("plumber");
    expect(ranked.map((p) => p.slug)).toEqual(["scored"]);
    expect(newcomers.map((p) => p.slug)).toEqual(["fresh", "old-new"]);
  });

  it("needs a score and at least 3 reviews to be ranked (boundary)", async () => {
    state.rows = [
      row("two", { score: 4.9, review_count: 2, use_again_pct: 100 }),
      row("three", { score: 4.1, review_count: 3, use_again_pct: 100 }),
    ];
    const { ranked, newcomers } = await listProvidersInCategory("plumber");
    expect(ranked.map((p) => p.slug)).toEqual(["three"]);
    expect(newcomers.map((p) => p.slug)).toEqual(["two"]);
  });

  it("maps verified_job_count", async () => {
    state.rows = [row("v", { score: 4, review_count: 3, verified_job_count: 2 }), row("none", { review_count: 0 })];
    const { ranked, newcomers } = await listProvidersInCategory("plumber");
    expect(ranked[0].verifiedJobCount).toBe(2);
    expect(newcomers[0].verifiedJobCount).toBe(0);
  });

  it("maps columns to camelCase", async () => {
    state.rows = [row("a", { score: 4, review_count: 3, use_again_pct: 100, has_whatsapp: true, business_name: "A Ltd" })];
    const { ranked } = await listProvidersInCategory("plumber");
    expect(ranked[0]).toMatchObject({ businessName: "A Ltd", useAgainPct: 100, reviewCount: 3, hasWhatsapp: true });
  });

  it("filters by category and district using array containment", async () => {
    await listProvidersInCategory("plumber", "BL3");
    expect(state.contains).toEqual([
      ["category_slugs", ["plumber"]],
      ["areas", ["BL3"]],
    ]);
  });

  it("throws on a database error", async () => {
    state.error = { message: "boom" };
    await expect(listProvidersInCategory("plumber")).rejects.toThrow(/boom/);
  });
});

describe("BL_DISTRICTS", () => {
  it("covers BL1-BL7 plus nearby districts", () => {
    expect(BL_DISTRICTS).toEqual(["BL1", "BL2", "BL3", "BL4", "BL5", "BL6", "BL7", "M26", "M28", "M46", "WN2"]);
  });
});

describe("listCategoryGroups", () => {
  it("adds liveCount per category from provider_public.category_slugs", async () => {
    state.tables = {
      category_groups: [
        { id: "g1", name: "Home & trades", slug: "home-trades", sort: 1 },
        { id: "g2", name: "Events & occasions", slug: "events-occasions", sort: 4 },
      ],
      categories: [
        { id: "c1", group_id: "g1", slug: "plumber", name: "Plumber", guidance_note: null },
        { id: "c2", group_id: "g1", slug: "tiler", name: "Tiler", guidance_note: null },
        { id: "c3", group_id: "g2", slug: "cakes", name: "Cakes", guidance_note: null },
      ],
      provider_public: [
        { category_slugs: ["plumber"] },
        { category_slugs: ["plumber", "cakes"] },
        { category_slugs: [] },
        { category_slugs: null },
      ],
    };
    const groups = await listCategoryGroups();
    expect(groups.map((g) => g.group.slug)).toEqual(["home-trades", "events-occasions"]);
    expect(groups[0].categories.map((c) => [c.slug, c.liveCount])).toEqual([
      ["plumber", 2],
      ["tiler", 0],
    ]);
    expect(groups[1].categories.map((c) => [c.slug, c.liveCount])).toEqual([["cakes", 1]]);
    // Only the slugs column is read from the public view.
    expect(state.selects).toContainEqual(["provider_public", "category_slugs"]);
  });

  it("throws on a database error", async () => {
    state.error = { message: "nope" };
    await expect(listCategoryGroups()).rejects.toThrow(/nope/);
  });
});
