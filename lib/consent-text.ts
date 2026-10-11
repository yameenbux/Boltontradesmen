// The statement a provider reads before agreeing to be listed. Bump the version when the wording changes:
// the version is stored with each consent as evidence of exactly what was agreed to.
export const CONSENT_TEXT_VERSION = "2026-10-11";

export const PRIVACY_PATH = "/privacy";

// Paragraphs of plain text; render them as text nodes only (never as HTML).
// Read from env at call time so the page picks up the deployed values.
export function consentText(env: Record<string, string | undefined> = process.env): string[] {
  const owner = env.OWNER_LEGAL_NAME || "Bolton Vouched (owner name pending)";
  const contact = env.CONTACT_EMAIL || "hello@example.com";
  return [
    "Bolton Vouched is a local directory of recommended tradespeople in Bolton. If you agree, we will list your business on it.",
    "What we will publish: your business name, the categories and areas shown on this page, and a contact button so that people can get in touch with you. Your phone number is not shown on the page; the contact button connects people to you.",
    "Reviews: people who have used your business can leave reviews on your listing. Reviews are published without your approval, and we do not remove a review just because you disagree with it. We will look at a review if it breaks our review policy.",
    "You can withdraw at any time. Tell us and we will remove your listing within one working day. Your reviews are hidden along with your profile, and restored if you are listed again.",
    "How we use your details is explained in our privacy notice.",
    `Bolton Vouched is run by ${owner}. Contact: ${contact}.`,
  ];
}
