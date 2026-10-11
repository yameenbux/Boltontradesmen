import { describe, it, expect } from "vitest";
import { checkRows } from "@/lib/checks";

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
