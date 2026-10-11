import { describe, it, expect } from "vitest";
import { initials } from "@/lib/initials";

describe("initials", () => {
  it("takes the first letters of the first two words", () => {
    expect(initials("Ace Plumbing")).toBe("AP");
    expect(initials("Deane Heating & Plumbing")).toBe("DH");
  });
  it("skips symbols, handles one word, lowercase and empty names", () => {
    expect(initials("& sons (Bolton)")).toBe("SB");
    expect(initials("halliwell")).toBe("H");
    expect(initials("  ")).toBe("?");
  });
});
