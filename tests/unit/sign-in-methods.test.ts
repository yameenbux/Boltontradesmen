import { describe, expect, it } from "vitest";
import { phoneSignInEnabled } from "@/lib/sign-in-methods";

describe("phoneSignInEnabled", () => {
  it("is on only for the exact value 'on' (trimmed, any case)", () => {
    expect(phoneSignInEnabled({ SIGN_IN_PHONE: "on" })).toBe(true);
    expect(phoneSignInEnabled({ SIGN_IN_PHONE: " ON " })).toBe(true);
  });

  it("is off for anything else, including unset", () => {
    expect(phoneSignInEnabled({})).toBe(false);
    expect(phoneSignInEnabled({ SIGN_IN_PHONE: "off" })).toBe(false);
    expect(phoneSignInEnabled({ SIGN_IN_PHONE: "1" })).toBe(false);
    expect(phoneSignInEnabled({ SIGN_IN_PHONE: "true" })).toBe(false);
    expect(phoneSignInEnabled({ SIGN_IN_PHONE: "" })).toBe(false);
  });
});
