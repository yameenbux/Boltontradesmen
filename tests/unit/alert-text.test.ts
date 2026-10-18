import { describe, expect, it } from "vitest";
import { clip, jobAlertEmail, jobAlertSms, nationalNumber, questionAlertEmail, questionAlertSms } from "@/lib/alert-text";

const job = { name: "Ash Patel", phone: "+447700900981", district: "BL3", body: "Kitchen tap leaking under the sink.\nAny day this week." };
const question = { district: "BL3", body: "Anyone know a good plumber in BL3? Need a new toilet fitted.", category: "Plumber" };
const link = "https://boltonvouched.ysbdesigns.uk/platform/provider#requests";

describe("nationalNumber", () => {
  it("writes mobiles and landlines the way people do", () => {
    expect(nationalNumber("+447700900981")).toBe("07700 900981");
    expect(nationalNumber("+441204555000")).toBe("01204 555000");
  });
});

describe("clip", () => {
  it("leaves short text alone, on one line", () => {
    expect(clip("a  b\nc", 20)).toBe("a b c");
  });
  it("cuts at a word with an ellipsis", () => {
    const out = clip("The boiler is making a loud banging noise every morning", 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toBe("The boiler is making a loud…");
  });
});

describe("job request alerts", () => {
  it("puts the number and the link in the text, and keeps it short", () => {
    const sms = jobAlertSms(job, link);
    expect(sms).toContain("07700 900981");
    expect(sms).toContain("BL3");
    expect(sms).toContain(link);
    expect(sms.length - link.length).toBeLessThanOrEqual(160);
  });
  it("emails the whole job, with the number, and escapes HTML", () => {
    const e = jobAlertEmail({ ...job, name: "<b>Ash</b>" }, link);
    expect(e.subject).toBe("Job request from <b>Ash</b> in BL3");
    expect(e.text).toContain("Any day this week.");
    expect(e.text).toContain("07700 900981");
    expect(e.html).toContain("&lt;b&gt;Ash&lt;/b&gt;");
    expect(e.html).not.toContain("<b>Ash</b>");
    expect(e.html).toContain(`href="${link}"`);
  });
});

describe("question alerts", () => {
  it("names the area and trade, with the link", () => {
    const sms = questionAlertSms(question, "https://x.test/q");
    expect(sms).toContain("someone in BL3 is asking for plumber");
    expect(sms).toContain("https://x.test/q");
    const e = questionAlertEmail(question, "https://x.test/q");
    expect(e.subject).toBe("BL3: someone's asking for plumber");
    expect(e.text).toContain(question.body);
  });
});
