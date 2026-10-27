"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { cardCheckoutUrl, cardPaymentFor } from "@/lib/card-payments";
import { clientIpFrom } from "@/lib/client-ip";
import { ipHash } from "@/lib/ip-hash";
import { stripeConfig } from "@/lib/pro";
import { rateAllow } from "@/lib/rate-limit";
import { deliverQuoteAnswerAlert } from "@/lib/notify";
import { createServiceClient } from "@/lib/supabase/service";
import { publicDocPath } from "@/lib/trade-docs";

const TOKEN = /^[0-9a-f-]{36}$/i;

/** The customer accepts or declines a quote, from its link (no sign-in: the link is the key). Tells the trader. */
export async function answerQuote(token: string, accept: boolean): Promise<{ ok: boolean; message: string }> {
  if (!TOKEN.test(token)) return { ok: false, message: "This link doesn't work." };
  const { data, error } = await createServiceClient().rpc("answer_quote", { p_token: token, p_accept: accept });
  if (error) {
    console.error("quote: answer_quote failed:", error.message);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  const r = (data ?? {}) as { result?: string; status?: string; id?: string };
  if (r.result === "already") return { ok: false, message: `You've already ${r.status} this quote.` };
  if (r.result === "expired") {
    return { ok: false, message: "This quote has passed its valid-until date. Ask them for an updated quote." };
  }
  if (r.result !== "ok" || !r.id) return { ok: false, message: "This quote isn't available." };
  const id = r.id;
  after(() => deliverQuoteAnswerAlert(id));
  revalidatePath(publicDocPath(token));
  return { ok: true, message: accept ? "Accepted. We've let them know." : "Declined. We've let them know." };
}

/**
 * Pay by card: a Stripe Checkout page on the trader's own Stripe account, for the rest of an invoice or a quote's
 * deposit. Redirects there; returns a message when it can't.
 */
export async function payByCard(token: string): Promise<{ ok: false; message: string } | never> {
  if (!TOKEN.test(token)) return { ok: false, message: "This link doesn't work." };
  const cfg = stripeConfig();
  if (!cfg) return { ok: false, message: "Card payments aren't available right now." };
  const ip = clientIpFrom(await headers()) || "unknown";
  if (!(await rateAllow("card-checkout", ipHash(ip), 20, 3600, true))) {
    return { ok: false, message: "Too many tries. Please wait a while and try again." };
  }
  let url: string | null = null;
  try {
    const pay = await cardPaymentFor(token);
    if (!pay) return { ok: false, message: "There's nothing to pay by card on this right now." };
    url = await cardCheckoutUrl(cfg, pay);
  } catch (err) {
    console.error("card payments: checkout failed:", err instanceof Error ? err.message : err);
  }
  if (!url) return { ok: false, message: "Card payment couldn't start. Please try again, or pay by bank transfer." };
  redirect(url);
}
