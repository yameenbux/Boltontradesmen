"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { clientIpFrom } from "@/lib/client-ip";
import { CONSENT_TEXT_VERSION, consentStatement } from "@/lib/consent-text";
import { platformPath } from "@/lib/paths";
import { createServiceClient } from "@/lib/supabase/service";

/** `manageHref`: the one-time link (sign in, then link the listing to that account) offered on the done screen. */
export type ConsentResult = { status: "ok" | "invalid" | "error"; manageHref?: string };

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
  if (data !== "ok") return { status: "invalid" };
  return { status: "ok", manageHref: await manageLink(token) };
}

// A trader link for the listing just agreed to (migration 000033). Never blocks the consent: without it the done
// screen simply has no button, and the admin can still send a link.
async function manageLink(token: string): Promise<string | undefined> {
  try {
    const { data, error } = await createServiceClient().rpc("consent_trader_link", { p_consent_token: token });
    if (error) {
      console.error("consent: consent_trader_link failed:", error.message);
      return undefined;
    }
    const r = data as { state?: string; token?: string } | null;
    return r?.state === "ok" && r.token ? platformPath("link", r.token) : undefined;
  } catch (err) {
    console.error("consent: consent_trader_link threw", err);
    return undefined;
  }
}
