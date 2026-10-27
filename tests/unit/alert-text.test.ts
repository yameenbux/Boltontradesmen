import { describe, expect, it } from "vitest";
import { clip, jobAlertEmail, jobAlertSms, nationalNumber, questionAlertEmail, questionAlertSms } from "@/lib/alert-text";

const job = { name: "Ash Patel", phone: "+447700900981", district: "BL3", body: "Kitchen tap leaking under the sink.\nAny day this week." };
const question = { district: "BL3", body: "Anyone know a good plumber in BL3? Need a new toilet fitted.", category: "Plumber" };
const link = "https://boltonvouched.ysbdesigns.uk/provider#requests";

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

describe("messages to a trader's customers", () => {
  const m = { business: "Brook Removals", customer: "Rosa", label: "INV-0001", total: "£165.00", link: "https://x.test/d/abc" };

  it("asks for an honest review, never a good one (review-link rule)", async () => {
    const { reviewRequestEmail, reviewRequestSms } = await import("@/lib/alert-text");
    const all = [reviewRequestSms("Brook Removals", "https://x.test/r/brook"), ...Object.values(reviewRequestEmail("Brook Removals", "Rosa", "https://x.test/r/brook"))].join(" ").toLowerCase();
    expect(all).toContain("honest review");
    expect(all).not.toMatch(/5[- ]star|five[- ]star|good review|positive|happy/);
    expect(reviewRequestSms("Brook Removals", "https://x.test/r/brook").length).toBeLessThanOrEqual(160);
  });

  it("reminds about an invoice with its number, amount and link", async () => {
    const { paymentReminderSms, paymentReminderEmail } = await import("@/lib/alert-text");
    expect(paymentReminderSms(m, false)).toBe(
      "Reminder: invoice INV-0001 from Brook Removals for £165.00 is now due. Details and how to pay: https://x.test/d/abc",
    );
    expect(paymentReminderEmail(m, true).subject).toBe("Second reminder: invoice INV-0001 from Brook Removals");
  });

  it("follows up a quote politely, with its number, amount and link", async () => {
    const { quoteFollowupEmail } = await import("@/lib/alert-text");
    const q = { ...m, label: "Q-0002" };
    const first = quoteFollowupEmail(q, false);
    expect(first.subject).toBe("Your quote Q-0002 from Brook Removals");
    expect(first.text).toContain("Just checking you got quote Q-0002 from Brook Removals, for £165.00.");
    expect(first.text).toContain("See the quote: https://x.test/d/abc");
    expect(quoteFollowupEmail(q, true).subject).toBe("Still interested? Q-0002 from Brook Removals");
    expect(first.text.toLowerCase()).not.toMatch(/last chance|expires today|hurry|limited/);
  });

  it("tells the trader a quote was answered", async () => {
    const { quoteAnsweredSms } = await import("@/lib/alert-text");
    expect(quoteAnsweredSms({ ...m, label: "Q-0001" }, true)).toContain("Rosa ACCEPTED quote Q-0001 (£165.00)");
  });
});
