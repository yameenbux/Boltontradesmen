"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/lib/admin-shared";
import { requireMember } from "@/lib/auth";
import { platformPath } from "@/lib/paths";
import { isTraderLinkError, TOKEN_PATTERN, TRADER_LINK_ERRORS } from "@/lib/trader-link";

/** "Yes, this is my business": links the signed-in account to the listing the trader link belongs to. */
export async function claimTraderLink(_prev: FormState, fd: FormData): Promise<FormState> {
  const raw = fd.get("token");
  const token = typeof raw === "string" ? raw.trim() : "";
  const valid = TOKEN_PATTERN.test(token);
  const { supabase } = await requireMember(valid ? platformPath("link", token) : platformPath("provider"));
  if (!valid) return { message: TRADER_LINK_ERRORS.link_invalid };

  const { error } = await supabase.rpc("claim_trader_link", { p_token: token });
  if (error) {
    if (isTraderLinkError(error.message)) return { message: TRADER_LINK_ERRORS[error.message] };
    console.error("trader link: claim_trader_link failed:", error.message);
    return { message: "Something went wrong. Please try again." };
  }
  redirect(platformPath("provider"));
}
