/**
 * Which sign-in methods are switched on. Read on the server at request time.
 * Phone sign-in (texted codes, needs Twilio) is on only when SIGN_IN_PHONE is exactly "on"
 * (trimmed, any case); anything else, including unset, means off.
 */
export function phoneSignInEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SIGN_IN_PHONE?.trim().toLowerCase() === "on";
}
