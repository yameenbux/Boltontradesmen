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
