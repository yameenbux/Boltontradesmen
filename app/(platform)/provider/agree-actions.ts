"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAccount } from "@/lib/auth";
import type { FormState } from "@/lib/admin-shared";
import { clientIpFrom } from "@/lib/client-ip";
import { CONSENT_TEXT_VERSION, consentStatement } from "@/lib/consent-text";
import { platformPath } from "@/lib/paths";
import { revalidatePublicPages } from "@/lib/revalidate-public";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * A listing linked to this account that they haven't agreed to yet (the admin made it from their request): the
 * trader ticks the same statement as the consent page, and it goes live. Recorded as the consent page records it.
 */
export async function agreeMyListing(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireAccount(platformPath("provider"));
  const providerId = typeof fd.get("provider_id") === "string" ? (fd.get("provider_id") as string) : "";
  if (!z.string().uuid().safeParse(providerId).success) return { message: "That listing isn't yours." };
  if (fd.get("agree") !== "yes") {
    return { errors: { agree: "Tick to agree to the terms and privacy notice, so we can put your listing live." } };
  }
  const statement = consentStatement();
  if (!statement) {
    console.error("agree refused: OWNER_LEGAL_NAME and CONTACT_EMAIL must be set in production");
    return { message: "We couldn't put your listing live just now. Try again later." };
  }
  const ip = clientIpFrom(await headers());
  const { data, error } = await createServiceClient().rpc("trader_agree_listing", {
    p_user_id: user.id,
    p_provider: providerId,
    p_evidence: {
      ip,
      text_version: CONSENT_TEXT_VERSION,
      text_sha256: statement.sha256,
      owner_legal_name: statement.owner,
      contact_email: statement.contact,
    },
  });
  if (error) {
    console.error("agree: trader_agree_listing failed:", error.message);
    return { message: "We couldn't put your listing live just now. Try again." };
  }
  if (data !== "ok") return { message: "This listing is already live, or isn't yours to agree to." };
  revalidatePath(platformPath("provider"));
  revalidatePublicPages();
  redirect(`${platformPath("provider")}?live=1`);
}
