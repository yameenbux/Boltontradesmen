import { describe, it, expect } from "vitest";
import { firstName, initials } from "@/lib/initials";

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

describe("firstName", () => {
  it("takes the first word of a contact name", () => {
    expect(firstName("Alan Ace")).toBe("Alan");
    expect(firstName("  Fran   Fresh ")).toBe("Fran");
    expect(firstName("Cher")).toBe("Cher");
  });
  it("is null when there is no name", () => {
    expect(firstName(null)).toBeNull();
    expect(firstName("   ")).toBeNull();
  });
});
