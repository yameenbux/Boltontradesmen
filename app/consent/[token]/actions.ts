"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { CONSENT_TEXT_VERSION } from "@/lib/consent-text";
import { createServiceClient } from "@/lib/supabase/service";

export type ConsentResult = { status: "ok" | "invalid" | "error" };

export async function acceptConsent(token: string): Promise<ConsentResult> {
  if (!z.string().uuid().safeParse(token).success) return { status: "invalid" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const { data, error } = await createServiceClient().rpc("accept_consent", {
    p_token: token,
    p_ip: ip,
    p_text_version: CONSENT_TEXT_VERSION,
  });
  if (error) return { status: "error" };
  return { status: data === "ok" ? "ok" : "invalid" };
}
