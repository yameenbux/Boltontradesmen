import { createHash } from "node:crypto";

// The statement a provider reads before agreeing to be listed. Bump the version when the wording changes:
// the version and a hash of the exact rendered text are stored with each consent as evidence.
export const CONSENT_TEXT_VERSION = "2026-10-11";

export const PRIVACY_PATH = "/privacy";
export const PRIVACY_ACK = "I have read the privacy notice.";

export type ConsentStatement = { paragraphs: string[]; sha256: string; owner: string; contact: string };

// Paragraphs of plain text; render them as text nodes only (never as HTML).
// Returns null (fail closed) in production when the owner or contact details are not configured.
export function consentStatement(
  env: Record<string, string | undefined> = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): ConsentStatement | null {
  let owner = env.OWNER_LEGAL_NAME?.trim();
  let contact = env.CONTACT_EMAIL?.trim();
  if (!owner || !contact) {
    if (nodeEnv === "production") return null;
    owner ||= "Bolton Vouched (owner name pending)";
    contact ||= "hello@example.com";
  }
  const paragraphs = [
    "If you agree, Bolton Vouched will list your business in its local directory of recommended tradespeople in Bolton.",
    "What we will publish: your business name, your trade, the areas you cover, and a contact button so that people can get in touch with you.",
    "Reviews: people who have used your business can leave reviews on your listing. Reviews are published without your approval, and we do not remove a review simply because you disagree with it.",
    "You can withdraw at any time. Tell us and we will remove your listing within one working day. Your reviews are hidden along with your profile, and restored if you are listed again.",
    PRIVACY_ACK,
    `Bolton Vouched is run by ${owner}. We're the data controller for the information above. Contact: ${contact}.`,
  ];
  const sha256 = createHash("sha256").update(paragraphs.join("\n\n")).digest("hex");
  return { paragraphs, sha256, owner, contact };
}
