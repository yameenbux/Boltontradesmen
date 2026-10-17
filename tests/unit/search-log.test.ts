import { describe, expect, it } from "vitest";
import { cleanSearch, searchLogLine } from "@/lib/search-log";

describe("cleanSearch", () => {
  it("normalises case and spaces", () => {
    expect(cleanSearch("  Boiler   SERVICE ")).toBe("boiler service");
  });
  it("masks digits so phone numbers and house numbers never reach the log", () => {
    expect(cleanSearch("plumber 07466 487591")).toBe("plumber ##### ######");
  });
  it("drops anything that looks like an email", () => {
    expect(cleanSearch("me@example.com")).toBeNull();
  });
  it("caps the length", () => {
    expect(cleanSearch("a".repeat(100))).toHaveLength(40);
  });
  it("rejects empty and non-string input", () => {
    expect(cleanSearch("   ")).toBeNull();
    expect(cleanSearch(42)).toBeNull();
  });
});

describe("searchLogLine", () => {
  it("keeps the category only for a match", () => {
    expect(searchLogLine({ q: "Plumber", matched: true, category: "plumber" })).toEqual({
      event: "home_search",
      matched: true,
      category: "plumber",
      q: "plumber",
    });
    expect(searchLogLine({ q: "skip hire", matched: false, category: "plumber" })?.category).toBeNull();
  });
  it("refuses odd bodies", () => {
    expect(searchLogLine({ q: "x" })).toBeNull();
    expect(searchLogLine({ q: "x", matched: true, category: "<script>" })?.category).toBeNull();
    expect(searchLogLine(null)).toBeNull();
  });
});
