import { describe, it, expect } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext (Review Focus 5)", () => {
  it.each(["/platform/p/ace/review", "/platform/account?x=1", "/platform", "/platform/provider/"])("keeps %s", (path) => {
    expect(safeNext(path)).toBe(path);
  });

  it.each([
    "//evil.example",
    "https://evil.example",
    "/admin",
    "/\\evil",
    "/platform/../admin",
    "/platform//evil.example",
    "/platformx",
    "/platform/p/ace#x",
    null,
    undefined,
    "",
  ])("rejects %s", (path) => {
    expect(safeNext(path)).toBe("/platform");
  });

  it("uses the given fallback", () => {
    expect(safeNext("//evil.example", "/platform")).toBe("/platform");
  });
});
