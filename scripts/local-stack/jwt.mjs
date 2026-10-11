#!/usr/bin/env node
// Signs the Supabase CLI's well-known local demo keys (HS256) so this stack
// accepts exactly the same anon / service_role keys as `supabase start`.
//
//   node scripts/local-stack/jwt.mjs            -> prints ANON_KEY=... and SERVICE_ROLE_KEY=...
//   node scripts/local-stack/jwt.mjs anon       -> prints just the anon key
//   node scripts/local-stack/jwt.mjs service_role
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

export const JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const EXP = 1983812996;

const b64url = (input) => Buffer.from(input).toString("base64url");

export function sign(payload, secret = JWT_SECRET) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

// Claim order (iss, role, exp) matches the CLI's keys byte for byte.
export const keyFor = (role) => sign({ iss: "supabase-demo", role, exp: EXP });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const role = process.argv[2];
  if (role) {
    console.log(keyFor(role));
  } else {
    console.log(`ANON_KEY=${keyFor("anon")}`);
    console.log(`SERVICE_ROLE_KEY=${keyFor("service_role")}`);
  }
}
