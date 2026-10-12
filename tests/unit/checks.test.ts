import { describe, it, expect } from "vitest";
import { checkRows, dayMonthYear } from "@/lib/checks";

describe("checkRows", () => {
  it("lists ID and insurance with dates, then a dash row when no accreditations", () => {
    expect(
      checkRows([
        { kind: "id", checked_at: "2026-10-03" },
        { kind: "insurance", expires_on: "2027-03-31", checked_at: "2026-10-03" },
      ]),
    ).toEqual([
      { kind: "id", title: "ID checked", detail: "October 2026", ok: true },
      { kind: "insurance", title: "Public liability insurance", detail: "Valid until March 2027", ok: true },
      { kind: "accreditations", title: "Trade accreditations", detail: "None provided", ok: false },
    ]);
  });

  it("shows only the accreditations dash row when nothing has been checked", () => {
    expect(checkRows([])).toEqual([
      { kind: "accreditations", title: "Trade accreditations", detail: "None provided", ok: false },
    ]);
  });

  it("gives each accreditation its own row by readable name, and no dash row", () => {
    expect(
      checkRows([
        { kind: "id", checked_at: "2026-10-03" },
        { kind: "gas_safe", expires_on: "2027-01-01", checked_at: "2026-10-03" },
        { kind: "niceic_napit", checked_at: "2026-09-12" },
        { kind: "dbs" },
      ]),
    ).toEqual([
      { kind: "id", title: "ID checked", detail: "October 2026", ok: true },
      { kind: "gas_safe", title: "Gas Safe registered", detail: "Valid until January 2027", ok: true },
      { kind: "niceic_napit", title: "NICEIC/NAPIT registered", detail: "Checked September 2026", ok: true },
      { kind: "dbs", title: "DBS checked", detail: "Checked", ok: true },
    ]);
  });

  it("uses the latest ID and insurance record and copes with missing dates", () => {
    expect(
      checkRows([
        { kind: "id", checked_at: "2025-02-01" },
        { kind: "insurance", expires_on: null, checked_at: null },
        { kind: "id", checked_at: "2026-10-03" },
      ]).slice(0, 2),
    ).toEqual([
      { kind: "id", title: "ID checked", detail: "October 2026", ok: true },
      { kind: "insurance", title: "Public liability insurance", detail: "Checked", ok: true },
    ]);
  });
});

describe("dayMonthYear", () => {
  it("writes plain dates day month year", () => {
    expect(dayMonthYear("2027-03-01")).toBe("1 March 2027");
    expect(dayMonthYear("2026-10-12")).toBe("12 October 2026");
  });

  it("writes timestamps as the date in Bolton", () => {
    // 23:30 UTC on 11 October is 00:30 on 12 October in British Summer Time.
    expect(dayMonthYear("2026-10-11T23:30:00Z")).toBe("12 October 2026");
    expect(dayMonthYear("2026-12-01T09:00:00+00:00")).toBe("1 December 2026");
  });

  it("copes with missing or bad input", () => {
    expect(dayMonthYear(null)).toBeNull();
    expect(dayMonthYear(undefined)).toBeNull();
    expect(dayMonthYear("not a date")).toBeNull();
    expect(dayMonthYear("2026-13-01")).toBeNull();
  });
});
