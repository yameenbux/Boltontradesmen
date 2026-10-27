import { describe, expect, it } from "vitest";
import { viewBody } from "@/lib/page-views";

describe("viewBody", () => {
  it("accepts a profile or trade page by slug", () => {
    expect(viewBody('{"kind":"profile","slug":"ace-plumbing"}')).toEqual({ kind: "profile", slug: "ace-plumbing" });
    expect(viewBody('{"kind":"category","slug":"man-and-van"}')).toEqual({ kind: "category", slug: "man-and-van" });
  });

  it("refuses anything else", () => {
    for (const t of ["", "nope", "null", '{"kind":"home","slug":"x"}', '{"kind":"profile","slug":"../x"}', '{"kind":"profile"}', `{"kind":"profile","slug":"${"a".repeat(81)}"}`]) {
      expect(viewBody(t)).toBeNull();
    }
  });
});
