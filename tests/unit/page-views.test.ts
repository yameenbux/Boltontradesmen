import { describe, expect, it } from "vitest";
import { arrivalSource, viewBody } from "@/lib/page-views";

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

  it("accepts arrivals from Facebook, Instagram, WhatsApp and posters only", () => {
    expect(viewBody('{"kind":"arrival","slug":"fb"}')).toEqual({ kind: "arrival", slug: "fb" });
    expect(viewBody('{"kind":"arrival","slug":"wa"}')).toEqual({ kind: "arrival", slug: "wa" });
    expect(viewBody('{"kind":"arrival","slug":"poster"}')).toEqual({ kind: "arrival", slug: "poster" });
    expect(viewBody('{"kind":"arrival","slug":"tiktok"}')).toBeNull();
  });

  it("refuses anything else", () => {
    for (const t of ["", "nope", "null", '{"kind":"home","slug":"x"}', '{"kind":"profile","slug":"../x"}', '{"kind":"profile"}', `{"kind":"profile","slug":"${"a".repeat(81)}"}`]) {
      expect(viewBody(t)).toBeNull();
    }
  });
});

describe("arrivalSource", () => {
  it("reads our tagged links first", () => {
    expect(arrivalSource("?ref=fb", "")).toBe("fb");
    expect(arrivalSource("?ref=WhatsApp", "")).toBe("wa");
    expect(arrivalSource("?ref=poster", "")).toBe("poster");
    expect(arrivalSource("?utm_source=instagram&utm_medium=social", "https://www.facebook.com/")).toBe("ig");
  });

  it("knows a click from Facebook by its fbclid", () => {
    expect(arrivalSource("?fbclid=IwAR0abc", "")).toBe("fb");
  });

  it("falls back to the page the visitor came from", () => {
    expect(arrivalSource("", "https://l.facebook.com/l.php?u=x")).toBe("fb");
    expect(arrivalSource("", "https://m.facebook.com/")).toBe("fb");
    expect(arrivalSource("", "https://l.instagram.com/")).toBe("ig");
    expect(arrivalSource("", "https://web.whatsapp.com/")).toBe("wa");
  });

  it("is null for everything else", () => {
    expect(arrivalSource("", "")).toBeNull();
    expect(arrivalSource("?ref=google", "https://www.google.com/")).toBeNull();
    expect(arrivalSource("", "https://notfacebook.com/")).toBeNull();
    expect(arrivalSource("", "https://www.boltonvouched.co.uk/")).toBeNull();
  });
});
