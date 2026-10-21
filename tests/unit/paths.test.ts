import { describe, expect, it } from "vitest";
import { PLATFORM_BASE, platformPath } from "@/lib/paths";

describe("platformPath", () => {
  it("is the home page with no segments", () => {
    expect(PLATFORM_BASE).toBe("");
    expect(platformPath()).toBe("/");
  });

  it("joins segments from the root", () => {
    expect(platformPath("c", "plumber")).toBe("/c/plumber");
    expect(platformPath("p", "ace-plumbing")).toBe("/p/ace-plumbing");
  });

  it("encodes each segment and strips stray slashes", () => {
    expect(platformPath("consent", "a b")).toBe("/consent/a%20b");
    expect(platformPath("/c/", "x/y")).toBe("/c/x%2Fy");
  });
});
