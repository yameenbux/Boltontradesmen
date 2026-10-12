// The only name we store and show: first name plus surname initial, "Sarah K.".
export class InvalidNameError extends Error {
  constructor(message = "Enter your first name and surname") {
    super(message);
    this.name = "InvalidNameError";
  }
}

// 1-30 characters: letters (any script), spaces, hyphens and apostrophes, starting with a letter.
const FIRST_NAME = /^\p{L}[\p{L} '-]{0,29}$/u;
const STARTS_WITH_LETTER = /^\p{L}/u;

function tidy(s: string): string {
  return s.normalize("NFC").replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();
}

export function formatDisplayName(first: string, surname: string): string {
  const f = tidy(first);
  const s = tidy(surname);
  if (!FIRST_NAME.test(f)) throw new InvalidNameError("Enter your first name (letters only, up to 30)");
  if (!STARTS_WITH_LETTER.test(s)) throw new InvalidNameError("Enter your surname");
  // Capitalise the first letter of each word (after a space or hyphen); keep the rest as typed.
  const capitalised = f.replace(/(^|[ -])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase("en-GB"));
  const initial = Array.from(s)[0].toLocaleUpperCase("en-GB");
  return `${capitalised} ${initial}.`;
}
