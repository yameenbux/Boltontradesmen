import { describe, it, expect } from "vitest";
import { formatDisplayName, InvalidNameError } from "@/lib/display-name";

describe("formatDisplayName", () => {
  it.each([
    ["sarah", "khan", "Sarah K."],
    ["Mary-Jane", "o'neil", "Mary-Jane O."],
    ["Zoë", "Ünal", "Zoë Ü."],
    ["  anne marie ", " smith", "Anne Marie S."],
  ])("%s %s -> %s", (first, surname, expected) => {
    expect(formatDisplayName(first, surname)).toBe(expected);
  });

  it.each([
    ["", "K"],
    ["Sarah1", "K"],
    ["Sarah", ""],
    ["Sarah", "1st"],
    ["a".repeat(31), "K"],
  ])("rejects (%s, %s)", (first, surname) => {
    expect(() => formatDisplayName(first, surname)).toThrow(InvalidNameError);
  });

  it("accepts a 30-letter first name", () => {
    expect(formatDisplayName("a".repeat(30), "k")).toBe(`A${"a".repeat(29)} K.`);
  });
});
