// The local inbox: Mailpit's HTTP API on :54324 (a real `supabase start`, as in CI) or the Docker-free stack's
// scripts/local-stack/mail-sink.mjs, which serves the same subset (scripts/local-stack/README.md).

/** E2E sign-in addresses use this domain; scripts/db-reset.sh deletes their accounts between runs. */
export const E2E_EMAIL_DOMAIN = "residents.example.test";

export const INBOX_URL = process.env.INBOX_URL ?? "http://127.0.0.1:54324";

type Summary = { ID: string; Created: string };

/**
 * The 6-digit code in the newest email to `email` received after `after`. Polls every 250 ms for up to 15 s;
 * throws (naming the inbox) if none arrives.
 */
export async function latestCode(email: string, after: Date): Promise<string> {
  const deadline = Date.now() + 15_000;
  const query = encodeURIComponent(`to:"${email}"`);
  while (Date.now() < deadline) {
    const res = await fetch(`${INBOX_URL}/api/v1/search?query=${query}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const { messages } = (await res.json()) as { messages?: Summary[] };
      const newest = (messages ?? []).find((m) => new Date(m.Created).getTime() > after.getTime());
      if (newest) {
        const msg = (await (await fetch(`${INBOX_URL}/api/v1/message/${newest.ID}`, { cache: "no-store" })).json()) as {
          Text?: string;
        };
        const code = /\b\d{6}\b/.exec(msg.Text ?? "")?.[0];
        if (code) return code;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No sign-in code email to ${email} after ${after.toISOString()} within 15 s (inbox: ${INBOX_URL})`);
}
