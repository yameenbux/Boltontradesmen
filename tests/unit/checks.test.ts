import { describe, it, expect } from "vitest";
import { checksSummaryText } from "@/lib/checks";

describe("checksSummaryText", () => {
  it("summarises ID and insurance with no accreditations", () => {
    expect(
      checksSummaryText([
        { kind: "id", checked_at: "2026-10-03" },
        { kind: "insurance", expires_on: "2027-03-31" },
      ]),
    ).toBe("✓ ID checked Oct 2026 · ✓ Insured to Mar 2027 · Accreditations: none provided");
  });

  it("says No checks yet when empty", () => {
    expect(checksSummaryText([])).toBe("No checks yet");
  });

  it("lists accreditations by readable name", () => {
    expect(
      checksSummaryText([
        { kind: "id", checked_at: "2026-10-03" },
        { kind: "gas_safe", expires_on: "2027-01-01" },
        { kind: "niceic_napit" },
      ]),
    ).toBe("✓ ID checked Oct 2026 · Accreditations: Gas Safe, NICEIC/NAPIT");
  });
});
