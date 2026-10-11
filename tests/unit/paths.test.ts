import { describe, expect, it } from "vitest";
import { PLATFORM_BASE, platformPath } from "@/lib/paths";

describe("platformPath", () => {
  it("is /platform with no segments", () => {
    expect(PLATFORM_BASE).toBe("/platform");
    expect(platformPath()).toBe("/platform");
  });

  it("joins segments under /platform", () => {
    expect(platformPath("c", "plumber")).toBe("/platform/c/plumber");
    expect(platformPath("p", "ace-plumbing")).toBe("/platform/p/ace-plumbing");
  });

  it("encodes each segment and strips stray slashes", () => {
    expect(platformPath("consent", "a b")).toBe("/platform/consent/a%20b");
    expect(platformPath("/c/", "x/y")).toBe("/platform/c/x%2Fy");
  });
});
