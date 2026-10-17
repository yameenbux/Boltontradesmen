import { describe, expect, it } from "vitest";
import { firstNameOf, greeting, timeOfDay } from "@/lib/greeting";

describe("greeting", () => {
  it("follows UK time, including British Summer Time", () => {
    expect(timeOfDay(new Date("2026-10-17T07:30:00Z"))).toBe("morning"); // 08:30 BST
    expect(timeOfDay(new Date("2026-10-17T11:30:00Z"))).toBe("afternoon"); // 12:30 BST
    expect(timeOfDay(new Date("2026-10-17T17:30:00Z"))).toBe("evening"); // 18:30 BST
    expect(timeOfDay(new Date("2026-12-01T11:59:00Z"))).toBe("morning"); // 11:59 GMT
    expect(timeOfDay(new Date("2026-12-01T02:00:00Z"))).toBe("evening"); // 2am counts as evening, not morning
  });
  it("uses the first name from the shown name", () => {
    expect(firstNameOf("Yameen B.")).toBe("Yameen");
    expect(firstNameOf("  Mary-Jane O. ")).toBe("Mary-Jane");
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
  it("reads naturally", () => {
    expect(greeting("Yameen", new Date("2026-10-17T13:00:00Z"))).toBe("Good afternoon, Yameen");
  });
});
