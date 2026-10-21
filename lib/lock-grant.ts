import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { LockGrant } from "@/lib/site-lock";

/**
 * Whether a shared link is real: a live listing's review form, a sent quote or invoice, an unused consent link or an
 * unused trader link. Only then does the pre-launch lock let that browser in. Fails closed: if the check can't run,
 * the visitor sees the password page.
 */
export async function grantIsReal(grant: LockGrant): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().rpc("lock_grant_valid", { p_kind: grant.kind, p_key: grant.key });
    if (error) {
      console.error("site lock: link check failed", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("site lock: link check failed", e instanceof Error ? e.message : e);
    return false;
  }
}
