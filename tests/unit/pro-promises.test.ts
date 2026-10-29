import { describe, expect, it } from "vitest";
import { FREE_FEATURES, PRO_FEATURES } from "@/lib/pro-features";

// What traders are promised, word for word: the For traders page, the sign-up form and the Pro offer all show these.
// Changing a promise? First check it works today, in production, with the services actually set up (texts need
// Twilio; reminders and follow-ups need the daily job; card payments need Stripe Connect). Then update this list in
// the same change, so every promise is a decision someone made, not a copy edit that slipped through.
describe("the promises to traders are the reviewed list", () => {
  it("Pro", () => {
    expect(PRO_FEATURES.map((f) => f.title)).toEqual([
      "Job requests, straight to you",
      "First to hear what Bolton's asking for",
      "See who's looking for your trade",
      "Never lose a quote to silence",
      "Quotes and invoices from your phone",
      "More reviews, without asking",
      "ID checked",
      "Photos of your work",
      "Your enquiries, month by month",
    ]);
  });

  it("Free", () => {
    expect(FREE_FEATURES).toEqual([
      "Your page, with Call and WhatsApp buttons that come straight to you: no lead fees, never sold to anyone else",
      "Reviews from Bolton residents, and your own review link and QR card",
      "Your enquiry count and page views on your dashboard",
      "A “Taking on work” switch, and your “Vouched in Bolton” website badge",
      "A spotlight post on our Facebook page once we've checked your listing",
    ]);
  });

  it("no Pro promise depends on texts or the daily job", () => {
    const all = PRO_FEATURES.map((f) => `${f.title} ${f.text}`.toLowerCase()).join("\n");
    for (const phrase of ["text message", "by text", "sms", "remind", "automatic", "follow-up email", "we chase"]) {
      expect(all, phrase).not.toContain(phrase);
    }
  });
});
