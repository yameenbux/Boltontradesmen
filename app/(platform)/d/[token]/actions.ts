"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
