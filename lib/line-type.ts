import "server-only";

// Twilio Lookup v2 line-type check, run before any sign-in code is sent. Only "mobile" passes.
// Every failure (missing credentials, HTTP error, timeout, Lookup error) is { kind: "error" }, and callers fail closed.
export type LineCheck = { kind: "mobile" | "voip" | "other"; lineType: string } | { kind: "error"; reason: string };

type Env = Record<string, string | undefined>;

const VOIP_TYPES = new Set(["fixedVoip", "nonFixedVoip"]);
// Ofcom's drama range 07700 900000-900999: never issued to real people, so safe to stub.
const DRAMA_RANGE = /^\+447700900\d{3}$/;

function stub(e164: string): LineCheck {
  if (e164 === "+447700900666") return { kind: "voip", lineType: "nonFixedVoip" };
  if (e164 === "+447700900999") return { kind: "error", reason: "stubbed lookup failure" };
  return { kind: "mobile", lineType: "mobile" };
}

export async function checkLineType(e164: string, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<LineCheck> {
  if (env.TWILIO_LOOKUP_STUB === "1" && DRAMA_RANGE.test(e164)) return stub(e164);

  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { kind: "error", reason: "Twilio credentials are not set" };

  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`;
  try {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return { kind: "error", reason: `Lookup HTTP ${res.status}` };
    const body = (await res.json()) as { line_type_intelligence?: { type?: string | null; error_code?: number | null } | null };
    const info = body.line_type_intelligence;
    if (!info || info.error_code != null || !info.type) {
      return { kind: "error", reason: `Lookup gave no line type${info?.error_code != null ? ` (error ${info.error_code})` : ""}` };
    }
    if (info.type === "mobile") return { kind: "mobile", lineType: info.type };
    if (VOIP_TYPES.has(info.type)) return { kind: "voip", lineType: info.type };
    return { kind: "other", lineType: info.type };
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    return { kind: "error", reason: name === "TimeoutError" ? "Lookup timed out" : `Lookup failed: ${name}` };
  }
}
