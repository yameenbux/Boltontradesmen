import { describe, expect, it } from "vitest";
import { viewBody } from "@/lib/page-views";

describe("viewBody", () => {
  it("accepts a profile or trade page by slug", () => {
    expect(viewBody('{"kind":"profile","slug":"ace-plumbing"}')).toEqual({ kind: "profile", slug: "ace-plumbing" });
    expect(viewBody('{"kind":"category","slug":"man-and-van"}')).toEqual({ kind: "category", slug: "man-and-van" });
  });

  it("accepts the sign-up funnel's steps only", () => {
    expect(viewBody('{"kind":"funnel","slug":"for-traders"}')).toEqual({ kind: "funnel", slug: "for-traders" });
    expect(viewBody('{"kind":"funnel","slug":"trader-form"}')).toEqual({ kind: "funnel", slug: "trader-form" });
    expect(viewBody('{"kind":"funnel","slug":"checkout"}')).toBeNull();
  });

  it("refuses anything else", () => {
    for (const t of ["", "nope", "null", '{"kind":"home","slug":"x"}', '{"kind":"profile","slug":"../x"}', '{"kind":"profile"}', `{"kind":"profile","slug":"${"a".repeat(81)}"}`]) {
      expect(viewBody(t)).toBeNull();
    }
  });
});
