import { describe, it, expect } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext (Review Focus 5)", () => {
  it.each(["/p/ace/review", "/account?x=1", "/", "/provider/"])("keeps %s", (path) => {
    expect(safeNext(path)).toBe(path);
  });

  it.each([
    "//evil.example",
    "https://evil.example",
    "/admin",
    "/\\evil",
    "/../admin",
    "//evil.example",
    "/api/me",
    "/site-lock",
    "/admin/requests",
    "/p/ace#x",
    // Browsers strip tabs and newlines before parsing: these would turn into //evil.example.
    "/\t/evil.example",
    "/?\n",
    "/c/plumber?q=a b",
    null,
    undefined,
    "",
  ])("rejects %s", (path) => {
    expect(safeNext(path)).toBe("/");
  });

  it("uses the given fallback", () => {
    expect(safeNext("//evil.example", "/")).toBe("/");
  });
});
