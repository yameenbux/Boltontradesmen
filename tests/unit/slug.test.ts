import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("drops apostrophes and punctuation", () => {
    expect(slugify("Dave's Bouncy Castles!")).toBe("daves-bouncy-castles");
  });
  it("strips accents and trims", () => {
    expect(slugify("  Ánna  Hair ")).toBe("anna-hair");
  });
  it("falls back for names with no usable characters", () => {
    expect(slugify("!!!")).toBe("provider");
  });
});
