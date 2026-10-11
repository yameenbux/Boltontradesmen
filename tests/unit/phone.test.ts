import { describe, it, expect } from "vitest";
import { toE164, InvalidPhoneError } from "@/lib/phone";

describe("toE164", () => {
  it.each(["07700 900123", "+44 7700 900 123", "447700900123"])("normalises %s", (input) => {
    expect(toE164(input)).toBe("+447700900123");
  });
  it("accepts a GB landline", () => {
    expect(toE164("01204 123456")).toBe("+441204123456");
  });
  it.each(["+1 415 555 0100", "12345", "", "not a number"])("rejects %s", (input) => {
    expect(() => toE164(input)).toThrow(InvalidPhoneError);
  });
});
