import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { duplicateMessage } from "@/lib/listing-duplicates";

describe("duplicateMessage", () => {
  it("lets a number nobody has through", () => {
    expect(duplicateMessage(null, true)).toBeNull();
  });
  it("names the listing that already has the number", () => {
    expect(duplicateMessage({ id: "x", business_name: "Ace Plumbing", status: "live" }, true)).toContain(
      "already on Ace Plumbing",
    );
    expect(duplicateMessage({ id: "x", business_name: "Ace Plumbing", status: "paused" }, false)).toContain(
      "already on Ace Plumbing",
    );
  });
  it("points a new listing for a removed trader's number to Reinvite", () => {
    expect(duplicateMessage({ id: "x", business_name: "Old Co", status: "removed" }, true)).toContain("Reinvite");
  });
  it("lets an existing listing be edited onto a removed listing's number", () => {
    expect(duplicateMessage({ id: "x", business_name: "Old Co", status: "removed" }, false)).toBeNull();
  });
});
