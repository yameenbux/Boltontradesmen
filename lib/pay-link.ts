// A Pro trader's own card payment link (SumUp, Square, PayPal...), shown on their unpaid invoices for traders who
// don't connect Stripe (migration 000055). Only links on the payment providers below are accepted, so a trader's
// invoice can't send customers to any other site. The database checks the same rule. Client-safe.

export const PAY_LINK_PROVIDERS: { host: string; name: string }[] = [
  { host: "pay.sumup.com", name: "SumUp" },
  { host: "sumup.me", name: "SumUp" },
  { host: "sumup.link", name: "SumUp" },
  { host: "square.link", name: "Square" },
  { host: "checkout.square.site", name: "Square" },
  { host: "paypal.me", name: "PayPal" },
  { host: "paypal.com", name: "PayPal" },
  { host: "buy.stripe.com", name: "Stripe" },
  { host: "monzo.me", name: "Monzo" },
  { host: "revolut.me", name: "Revolut" },
  { host: "settleup.starlingbank.com", name: "Starling" },
];

export const PAY_LINK_MAX = 300;
export const PAY_LINK_ERROR =
  "Paste a payment link from SumUp, Square, PayPal, Stripe, Monzo, Revolut or Starling, starting https://";

/** The link cleaned (a missing https:// added), with the provider's name, or null when it isn't one we accept. */
export function payLink(raw: string): { url: string; name: string } | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const p = PAY_LINK_PROVIDERS.find((x) => x.host === host);
  if (!p || u.pathname.length < 2) return null;
  const url = `https://${u.hostname.toLowerCase()}${u.pathname}${u.search}`;
  if (url.length > PAY_LINK_MAX || /[\s<>"]/.test(url)) return null;
  return { url, name: p.name };
}
