import { welcomePath } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

/** Shown on the sign-in page when it is opened with ?error=google. */
export const GOOGLE_SIGN_IN_ERROR = "We couldn't sign you in with Google. Please try again, or use an email code.";

export function googleErrorPath(next: string | null | undefined): string {
  return `/platform/sign-in?error=google&next=${encodeURIComponent(safeNext(next))}`;
}

type CallbackDeps = {
  /** Swaps the one-time code for a session (PKCE: the verifier is in a cookie). True when signed in. */
  exchange(code: string): Promise<boolean>;
  account(): Promise<{ display_name: string | null; deleted: boolean } | null>;
};

/**
 * Where /platform/auth/callback sends someone back from Google. Cancelled at Google, refused by the
 * database (GoTrue reports the auth.users guard as error=server_error, "Database error saving new user"),
 * or a failed exchange → the sign-in page with the Google copy. A new or deleted account → Welcome.
 * Otherwise `next`. `next` always passes safeNext.
 */
export async function googleCallbackPath(
  params: { code: string | null; error: string | null; next: string | null },
  deps: CallbackDeps,
): Promise<string> {
  const next = safeNext(params.next);
  if (params.error || !params.code) return googleErrorPath(next);
  let ok = false;
  try {
    ok = await deps.exchange(params.code);
  } catch (err) {
    console.error("google sign-in: code exchange failed:", err);
  }
  if (!ok) return googleErrorPath(next);
  let account: Awaited<ReturnType<CallbackDeps["account"]>>;
  try {
    account = await deps.account();
  } catch (err) {
    // Signed in, but the profile lookup failed: carry on; the next page checks the profile itself.
    console.error("google sign-in: account lookup failed:", err);
    return next;
  }
  if (!account || !account.display_name || account.deleted) return welcomePath(next);
  return next;
}
