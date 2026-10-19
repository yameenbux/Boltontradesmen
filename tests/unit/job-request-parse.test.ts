import { describe, expect, it } from "vitest";
import { JOB_ERRORS } from "@/lib/job-request";
import { parseJobRequest } from "@/lib/job-request-parse";

function form(v: Partial<Record<"name" | "phone" | "email" | "district" | "body", string>>): FormData {
  const fd = new FormData();
  const all = { name: "Ash Patel", phone: "07700 900981", email: "", district: "bl3", body: "Kitchen tap leaking", ...v };
  for (const [k, x] of Object.entries(all)) fd.set(k, x);
  return fd;
}

describe("parseJobRequest", () => {
  it("cleans a good request", () => {
    const r = parseJobRequest(form({ name: "  Ash   Patel ", email: " Ash@Example.COM ", body: "Tap   leaking\n\n\n\nSoon please" }));
    expect(r).toEqual({
      ok: true,
      data: { name: "Ash Patel", phone_e164: "+447700900981", email: "ash@example.com", district: "BL3", body: "Tap leaking\n\nSoon please" },
    });
  });

  it("takes a landline and no email", () => {
    const r = parseJobRequest(form({ phone: "01204 555000" }));
    expect(r.ok && r.data.phone_e164).toBe("+441204555000");
    expect(r.ok && r.data.email).toBeNull();
  });

  it("says which fields are wrong", () => {
    const r = parseJobRequest(form({ name: "A", phone: "123", email: "nope", district: "M1", body: "short" }));
    expect(r).toEqual({
      ok: false,
      errors: { name: JOB_ERRORS.name, phone: JOB_ERRORS.phone, email: JOB_ERRORS.email, district: JOB_ERRORS.district, body: JOB_ERRORS.body },
    });
  });

  it("refuses a job over 1,000 characters", () => {
    const r = parseJobRequest(form({ body: "x".repeat(1001) }));
    expect(r.ok).toBe(false);
  });
});
