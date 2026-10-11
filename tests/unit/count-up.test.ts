import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { CountUp } from "@/components/CountUp";

// Review Focus 2: with JS off (server HTML) or reduced motion, the real number shows, never 0.
describe("CountUp", () => {
  it("renders the target number on the server / first paint", () => {
    const html = renderToString(createElement(CountUp, { to: 96 }));
    expect(html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "")).toBe("96");
  });

  it("renders 0 only when the target is 0", () => {
    const html = renderToString(createElement(CountUp, { to: 0 }));
    expect(html.replace(/<[^>]+>/g, "")).toBe("0");
  });
});
