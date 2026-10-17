"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { clientIpFrom } from "@/lib/client-ip";
import { CONSENT_TEXT_VERSION, consentStatement } from "@/lib/consent-text";
import { createServiceClient } from "@/lib/supabase/service";

export type ConsentResult = { status: "ok" | "invalid" | "error" };

/** `agreed` is the trader's tick on the terms and privacy box; nothing is recorded without it. */
export async function acceptConsent(token: string, agreed: boolean): Promise<ConsentResult> {
  if (!z.string().uuid().safeParse(token).success) return { status: "invalid" };
  if (agreed !== true) return { status: "error" };
  const statement = consentStatement();
  if (!statement) {
    console.error("consent refused: OWNER_LEGAL_NAME and CONTACT_EMAIL must be set in production");
    return { status: "invalid" };
  }
  const h = await headers();
  const ip = clientIpFrom(h);
  const { data, error } = await createServiceClient().rpc("accept_consent", {
    p_token: token,
    p_ip: ip,
    p_text_version: CONSENT_TEXT_VERSION,
    p_text_sha256: statement.sha256,
    p_owner_legal_name: statement.owner,
    p_contact_email: statement.contact,
  });
  if (error) return { status: "error" };
  return { status: data === "ok" ? "ok" : "invalid" };
}
