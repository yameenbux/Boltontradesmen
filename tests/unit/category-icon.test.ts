import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CATEGORY_ICON_SLUGS } from "@/components/CategoryIcon";

describe("CategoryIcon", () => {
  it("has an icon for every seeded category slug", () => {
    const seed = readFileSync(path.resolve(__dirname, "../../supabase/seed.sql"), "utf8");
    const slugs = [...seed.matchAll(/\('[a-z-]+', '([a-z-]+)', '[^']+', '[a-z_]+'/g)].map((m) => m[1]);
    expect(slugs.length).toBe(44);
    expect(slugs.filter((s) => !CATEGORY_ICON_SLUGS.includes(s))).toEqual([]);
  });
});
