import { nationalMobile } from "@/lib/phone-format";

// The words of a trader's alerts (pure: lib/notify.ts sends them). Texts stay short: the trader is often up a
// ladder, so the number and the link come first and the job is cut to fit.

export type JobAlert = { name: string; phone: string; district: string; body: string };
export type QuestionAlert = { district: string; body: string; category: string };
export type Email = { subject: string; text: string; html: string };

/** A UK number the way people write it: "07700 900123", or "01204 555000" for a landline. */
export function nationalNumber(e164: string): string {
  if (/^\+447\d{9}$/.test(e164)) return nationalMobile(e164);
  const m = /^\+44(\d{3,4})(\d{6})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]}` : e164;
}

/** The text on one line, cut at a word to `max` characters with "…". */
export function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function html(paragraphs: string[], link: { href: string; label: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${escape(p).replace(/\n/g, "<br>")}</p>`).join("");
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.5;color:#231A15;max-width:520px">` +
    body +
    `<p style="margin:20px 0"><a href="${escape(link.href)}" style="background:#9C3A25;color:#FFF5E9;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">${escape(link.label)}</a></p>` +
    `<p style="margin:0;color:#6B5D53;font-size:14px">You get these because you have Pro on Bolton Vouched. Change where alerts go, or turn them off, from your listing page.</p>` +
    `</div>`
  );
}

export function jobAlertSms(j: JobAlert, link: string): string {
  return `Bolton Vouched: job request from ${clip(j.name, 30)} in ${j.district}, ${nationalNumber(j.phone)}: "${clip(j.body, 70)}" ${link}`;
}

export function jobAlertEmail(j: JobAlert, link: string): Email {
  const number = nationalNumber(j.phone);
  const lines = [
    `${j.name} in ${j.district} has asked you for a quote through Bolton Vouched.`,
    `Their number: ${number}`,
    `The job:\n${j.body}`,
    "Call or WhatsApp them soon: people usually go with whoever gets back first.",
  ];
  const label = "See the request";
  return {
    subject: `Job request from ${clip(j.name, 30)} in ${j.district}`,
    text: `${lines.join("\n\n")}\n\n${label}: ${link}\n`,
    html: html(lines, { href: link, label }),
  };
}

export function questionAlertSms(q: QuestionAlert, link: string): string {
  return `Bolton Vouched: someone in ${q.district} is asking for ${q.category.toLowerCase()}: "${clip(q.body, 80)}" Answer: ${link}`;
}

export function questionAlertEmail(q: QuestionAlert, link: string): Email {
  const lines = [
    `Someone in ${q.district} has asked Bolton for ${q.category.toLowerCase()}:`,
    `"${q.body}"`,
    `You cover ${q.district}, so you're one of the traders we've told. Say you can help, and your page shows under the question with your Call button.`,
  ];
  const label = "Answer the question";
  return {
    subject: `${q.district}: someone's asking for ${q.category.toLowerCase()}`,
    text: `${lines.join("\n\n")}\n\n${label}: ${link}\n`,
    html: html(lines, { href: link, label }),
  };
}

// ---------------------------------------------------------------- quotes, invoices and the customer's messages
// To the customer, from the trader through Bolton Vouched. The review request follows the review-link rule
// (lib/review-link.ts): it goes after every paid invoice, and asks for an honest review, never a good one.

export type DocMessage = { business: string; customer: string; label: string; total: string; link: string };

function customerHtml(paragraphs: string[], link: { href: string; label: string }, footer: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${escape(p).replace(/\n/g, "<br>")}</p>`).join("");
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:16px;line-height:1.5;color:#231A15;max-width:520px">` +
    body +
    `<p style="margin:20px 0"><a href="${escape(link.href)}" style="background:#9C3A25;color:#FFF5E9;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">${escape(link.label)}</a></p>` +
    `<p style="margin:0;color:#6B5D53;font-size:14px">${escape(footer)}</p>` +
    `</div>`
  );
}

const FROM_TRADER = (business: string) =>
  `Sent for ${business} by Bolton Vouched, Bolton's directory of trades vouched for by locals.`;

export function reviewRequestSms(business: string, link: string): string {
  return `Thanks for using ${clip(business, 40)}. Could you leave an honest review on Bolton Vouched? It helps neighbours choose: ${link}`;
}

export function reviewRequestEmail(business: string, customer: string, link: string): Email {
  const lines = [
    `Hi ${customer},`,
    `Thanks for using ${business}. Could you take a minute to leave an honest review on Bolton Vouched? Whatever your experience, it helps your neighbours choose a trade.`,
  ];
  const label = "Leave a review";
  return {
    subject: `How did ${business} do?`,
    text: `${lines.join("\n\n")}\n\n${label}: ${link}\n\n${FROM_TRADER(business)}\n`,
    html: customerHtml(lines, { href: link, label }, FROM_TRADER(business)),
  };
}

export function paymentReminderSms(m: DocMessage, second: boolean): string {
  return `${second ? "Second reminder" : "Reminder"}: invoice ${m.label} from ${clip(m.business, 40)} for ${m.total} is now due. Details and how to pay: ${m.link}`;
}

export function paymentReminderEmail(m: DocMessage, second: boolean): Email {
  const lines = [
    `Hi ${m.customer},`,
    `${second ? "A second reminder" : "A reminder"} that invoice ${m.label} from ${m.business}, for ${m.total}, is now due.`,
    "If you've already paid, thank you, and please ignore this.",
  ];
  const label = "See the invoice";
  return {
    subject: `${second ? "Second reminder" : "Reminder"}: invoice ${m.label} from ${m.business}`,
    text: `${lines.join("\n\n")}\n\n${label}: ${m.link}\n\n${FROM_TRADER(m.business)}\n`,
    html: customerHtml(lines, { href: m.link, label }, FROM_TRADER(m.business)),
  };
}

export function docEmail(kind: "quote" | "invoice", m: DocMessage): Email {
  const what = kind === "quote" ? "quote" : "invoice";
  const lines = [
    `Hi ${m.customer},`,
    `${m.business} has sent you ${what} ${m.label}, for ${m.total}.`,
    kind === "quote" ? "You can accept or decline it online." : "It shows how to pay.",
  ];
  const label = kind === "quote" ? "See the quote" : "See the invoice";
  return {
    subject: `${kind === "quote" ? "Quote" : "Invoice"} ${m.label} from ${m.business}`,
    text: `${lines.join("\n\n")}\n\n${label}: ${m.link}\n\n${FROM_TRADER(m.business)}\n`,
    html: customerHtml(lines, { href: m.link, label }, FROM_TRADER(m.business)),
  };
}

export function quoteAnsweredSms(m: DocMessage, accepted: boolean): string {
  return `Bolton Vouched: ${clip(m.customer, 30)} ${accepted ? "ACCEPTED" : "declined"} quote ${m.label} (${m.total}). ${m.link}`;
}

export function quoteAnsweredEmail(m: DocMessage, accepted: boolean): Email {
  const lines = [
    `${m.customer} has ${accepted ? "accepted" : "declined"} quote ${m.label}, for ${m.total}.`,
    accepted ? "Turn it into an invoice in one tap when the job's done." : "Nothing more to do.",
  ];
  const label = "See the quote";
  return {
    subject: `Quote ${m.label} ${accepted ? "accepted" : "declined"} by ${m.customer}`,
    text: `${lines.join("\n\n")}\n\n${label}: ${m.link}\n`,
    html: html(lines, { href: m.link, label }),
  };
}

// ---------------------------------------------------------------- a trader's listing approved

export type Approval = { name: string; business: string; pro: boolean };

const FROM_US = "Bolton Vouched, Bolton's directory of trades vouched for by locals.";

export function approvalSms(a: Approval, link: string): string {
  return a.pro
    ? `Bolton Vouched: ${clip(a.business, 40)} is approved. Start Pro here (£10 a month or £100 a year, cancel any time): ${link}`
    : `Bolton Vouched: ${clip(a.business, 40)} is approved. See your listing: ${link}`;
}

export function approvalEmail(a: Approval, link: string): Email {
  const lines = [
    `Hi ${a.name},`,
    `Good news: ${a.business} is approved on Bolton Vouched.`,
    a.pro
      ? "You chose Pro. Tap below to pay by card (£10 a month or £100 a year) and Pro switches on straight away: job requests by text, Ask Bolton alerts, quotes and invoices, and more. Cancel any time."
      : "Your free listing is ready. Sign in to see your page, reply to reviews and share your review link. You can add Pro any time.",
  ];
  const label = a.pro ? "Start Pro" : "See your listing";
  return {
    subject: `${a.business} is approved on Bolton Vouched`,
    text: `${lines.join("\n\n")}\n\n${label}: ${link}\n\n${FROM_US}\n`,
    html: customerHtml(lines, { href: link, label }, FROM_US),
  };
}

// ---------------------------------------------------------------- a trader's own sign-up, live straight away

export function liveEmail(a: Approval, link: string): Email {
  const lines = [
    `Hi ${a.name},`,
    `${a.business} is live on Bolton Vouched. Customers can find you and call or WhatsApp you now.`,
    a.pro
      ? "You chose Pro. Tap below to pay by card (£10 a month or £100 a year) and Pro switches on straight away: job requests by text, Ask Bolton alerts, quotes and invoices, and more. Cancel any time."
      : "Sign in to see your page, reply to reviews and share your review link. You can add Pro any time.",
  ];
  const label = a.pro ? "Start Pro" : "See your listing";
  return {
    subject: `${a.business} is live on Bolton Vouched`,
    text: `${lines.join("\n\n")}\n\n${label}: ${link}\n\n${FROM_US}\n`,
    html: customerHtml(lines, { href: link, label }, FROM_US),
  };
}

// ---------------------------------------------------------------- the admin changed a listing's number

export function numberChangedEmail(business: string, phone: string, link: string, contact: string): Email {
  const lines = [
    "Hi,",
    `We've updated the phone number on ${business}'s Bolton Vouched listing to ${nationalNumber(phone)}. Customers' calls and WhatsApps now go to this number.`,
    `If that's not right, email ${contact} and we'll change it back.`,
  ];
  const label = "See your listing";
  return {
    subject: `The number on ${business}'s listing has changed`,
    text: `${lines.join("\n\n")}\n\n${label}: ${link}\n\n${FROM_US}\n`,
    html: customerHtml(lines, { href: link, label }, FROM_US),
  };
}
