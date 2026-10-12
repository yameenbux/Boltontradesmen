import { afterEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "@/components/Analytics";

afterEach(() => vi.unstubAllEnvs());

describe("Analytics", () => {
  it("renders nothing without a token", () => {
    vi.stubEnv("CF_WEB_ANALYTICS_TOKEN", "");
    expect(Analytics({})).toBeNull();
    expect(Analytics({ token: "   " })).toBeNull();
    vi.stubEnv("CF_WEB_ANALYTICS_TOKEN", undefined as unknown as string);
    expect(Analytics({})).toBeNull();
  });

  it("loads Cloudflare's beacon after hydration with the token from the environment", () => {
    vi.stubEnv("CF_WEB_ANALYTICS_TOKEN", " abc123 ");
    const el = Analytics({});
    expect(el?.props).toMatchObject({
      src: "https://static.cloudflareinsights.com/beacon.min.js",
      strategy: "afterInteractive",
      defer: true,
      "data-cf-beacon": '{"token":"abc123"}',
    });
  });
});
