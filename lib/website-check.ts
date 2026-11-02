// The free website check (/website-check), requested by the owner: a trader asks YSB Designs, the team behind Bolton
// Vouched, to look at their website and Google profile. Nothing is stored: the request is emailed to us. Its fields,
// limits, messages and the email. Client-safe and light (no zod, no phone library): the form imports it. The server
// checks with lib/website-check-parse.ts.
import type { Email } from "@/lib/alert-text";

export const CHECK_LIMITS = {
  contact_name: 60,
  business_name: 80,
  trade: 60,
  phone: 20,
  email: 254,
  link: 200,
} as const;

export const CHECK_FIELDS = ["contact_name", "business_name", "trade", "phone", "email", "link"] as const;

export type WebsiteCheckRequest = {
  contact_name: string;
  business_name: string;
  trade: string;
  phone_e164: string;
  email: string | null;
  link: string | null;
};

export type CheckFormState = {
  ok?: boolean;
  errors?: Partial<Record<keyof typeof CHECK_LIMITS, string>>;
  message?: string;
  values?: Record<string, string>;
};

export const CHECK_ERRORS = {
  contact_name: "Enter your name, in up to 60 characters.",
  business_name: "Enter your business name, in up to 80 characters.",
  trade: "Enter your trade, in up to 60 characters.",
  phone: "Enter a mobile or landline number in the UK, like 07700 900123.",
  email: "Enter an email address like name@example.com, or leave it empty.",
  link: "Keep the link to 200 characters, or leave it empty.",
  captcha: "We couldn't check you're not a robot. Please try again.",
  limited: "We've already had a few requests from you. We'll be in touch; if it's urgent, WhatsApp us on 07466 487591.",
  failed: "Something went wrong. Please try again, or WhatsApp us on 07466 487591.",
} as const;

export const CHECK_DONE = "Thanks. We'll look at your website and Google profile and get back to you within 2 working days.";

/** The email to us: who asked, how to reach them, and what to look at. Plain text and simple HTML. */
export function websiteCheckEmail(r: WebsiteCheckRequest): Email {
  const lines = [
    `Website check request from ${r.contact_name}, ${r.business_name} (${r.trade}).`,
    "",
    `Phone: ${r.phone_e164}`,
    `Email: ${r.email ?? "not given"}`,
    `Website or profile: ${r.link ?? "none given (no website?)"}`,
    "",
    "Sent from the free website check on Bolton Vouched (/website-check). Reply within 2 working days, as the page promises.",
  ];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return {
    subject: `Website check: ${r.business_name}`,
    text: lines.join("\n"),
    html: lines.map((l) => (l ? `<p>${esc(l)}</p>` : "")).join(""),
  };
}
