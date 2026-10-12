// Trader sign-in links (Plan 2b Task 9): the admin sends a trader a single-use link that links the signed-in account
// that opens it to their listing. Codes are raised by public.claim_trader_link / returned by trader_link_preview.

export const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TRADER_LINK_ERRORS = {
  link_invalid: "This link isn't valid. Ask us for a new one.",
  link_used: "This link has already been used. If that wasn't you, contact us.",
  link_expired: "This link has expired. Ask us for a new one.",
  listing_already_linked: "This listing is already linked to an account. If that's not you, contact us.",
  account_already_linked:
    "Your account is already linked to another listing. Sign in with a different account, or contact us.",
  account_not_allowed: "This account can't be linked to a listing.",
} as const;

export type TraderLinkState = "ok" | keyof typeof TRADER_LINK_ERRORS;

export function isTraderLinkError(code: string): code is keyof typeof TRADER_LINK_ERRORS {
  return Object.prototype.hasOwnProperty.call(TRADER_LINK_ERRORS, code);
}
