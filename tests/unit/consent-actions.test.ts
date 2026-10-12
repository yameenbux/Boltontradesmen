import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc }) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }),
}));

import { acceptConsent } from "@/app/platform/consent/[token]/actions";

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: "ok", error: null });
});

describe("acceptConsent", () => {
  it("records the IP the trusted proxy appended, not a spoofed leftmost entry", async () => {
    const res = await acceptConsent("6f1c1b8e-7a8a-4d2b-9a55-3b0f7f1f2a10");
    expect(res).toEqual({ status: "ok" });
    expect(rpc).toHaveBeenCalledWith("accept_consent", expect.objectContaining({ p_ip: "203.0.113.7" }));
  });
});
