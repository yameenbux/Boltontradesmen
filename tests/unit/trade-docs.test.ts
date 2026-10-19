import { describe, expect, it } from "vitest";
import { docNumber, docTotal, money, parsePence, parseQuantity, sortCode } from "@/lib/trade-docs";

describe("trade docs", () => {
  it("numbers quotes and invoices", () => {
    expect(docNumber("quote", 7)).toBe("Q-0007");
    expect(docNumber("invoice", 12345)).toBe("INV-12345");
  });
  it("formats pounds", () => {
    expect(money(16500)).toBe("£165.00");
    expect(money(123456)).toBe("£1,234.56");
  });
  it("reads prices as people type them", () => {
    expect(parsePence("45")).toBe(4500);
    expect(parsePence("£45.5")).toBe(4550);
    expect(parsePence("1,200.99")).toBe(120099);
    expect(parsePence("45.555")).toBeNull();
    expect(parsePence("-3")).toBeNull();
    expect(parsePence("")).toBeNull();
  });
  it("reads quantities", () => {
    expect(parseQuantity("1.5")).toBe(1.5);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("abc")).toBeNull();
  });
  it("adds up lines the way the database does", () => {
    expect(docTotal([{ description: "a", quantity: 3, unit_pence: 4500 }, { description: "b", quantity: 1.5, unit_pence: 2000 }])).toBe(16500);
    expect(docTotal([{ description: "a", quantity: 0.33, unit_pence: 1001 }])).toBe(330);
  });
  it("shows sort codes with dashes", () => {
    expect(sortCode("123456")).toBe("12-34-56");
  });
});
