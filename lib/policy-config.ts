import { consentStatement } from "@/lib/consent-text";

// Owner and contact for the policy pages. In production they must be configured: throwing here fails the build
// (the pages are prerendered) rather than publishing a notice with no controller identity.
export function policyIdentity(
  env: Record<string, string | undefined> = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): { owner: string; contact: string } {
  const c = consentStatement(env, nodeEnv);
  if (!c) throw new Error("OWNER_LEGAL_NAME and CONTACT_EMAIL must be set in production.");
  return { owner: c.owner, contact: c.contact };
}
