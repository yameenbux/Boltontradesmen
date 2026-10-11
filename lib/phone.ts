import { parsePhoneNumberFromString } from "libphonenumber-js/min";

export class InvalidPhoneError extends Error {
  constructor(input: string) {
    super(`Not a valid UK phone number: ${input}`);
    this.name = "InvalidPhoneError";
  }
}

// Normalises a UK mobile or landline to E.164 (+44...). Throws InvalidPhoneError otherwise.
// Shape check is ours rather than libphonenumber's isValid(), which rejects Ofcom's reserved
// drama ranges (07700 900xxx) that we use in fixtures and examples.
export function toE164(input: string): string {
  const parsed = parsePhoneNumberFromString(input.trim(), "GB");
  if (!parsed || parsed.countryCallingCode !== "44") throw new InvalidPhoneError(input);
  const n = parsed.nationalNumber;
  const mobile = /^7[1-9]\d{8}$/.test(n); // 07xxx xxxxxx
  const landline = /^[123]\d{8,9}$/.test(n); // 01/02/03 geographic and non-geographic
  if (!mobile && !landline) throw new InvalidPhoneError(input);
  return `+44${n}`;
}
