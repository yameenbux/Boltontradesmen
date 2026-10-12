#!/usr/bin/env node
// Disposable email domains: lib/disposable-email-domains.json is the source; the database copy
// (public.blocked_email_domains) is seeded from it by a migration this script generates.
//
//   node scripts/disposable-domains-sql.mjs                      print the idempotent SQL insert block
//   node scripts/disposable-domains-sql.mjs --update-json <conf> rewrite the JSON from a downloaded
//        disposable_email_blocklist.conf (https://github.com/disposable-email-domains/disposable-email-domains,
//        CC0), minus the never-block list below, dated today
//
// A refreshed list ships as a NEW migration (…_disposable_email_domains.sql) holding this script's output;
// tests/unit/disposable-parity.test.ts checks the newest one matches the JSON.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = path.join(root, "lib/disposable-email-domains.json");

// Mainstream providers (and our own domain) that must never be refused, whatever the upstream list says.
const NEVER_BLOCK = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.co.uk", "hotmail.com", "live.co.uk", "yahoo.co.uk",
  "yahoo.com", "icloud.com", "me.com", "btinternet.com", "sky.com", "virginmedia.com", "talktalk.net", "aol.com",
  "protonmail.com", "proton.me", "ysbdesigns.uk",
]);

const args = process.argv.slice(2);
if (args[0] === "--update-json") {
  if (!args[1]) throw new Error("usage: --update-json <disposable_email_blocklist.conf>");
  const domains = [
    ...new Set(
      readFileSync(args[1], "utf8")
        .split("\n")
        .map((l) => l.trim().toLowerCase())
        .filter((l) => l && !l.startsWith("#") && !/\s/.test(l) && !NEVER_BLOCK.has(l)),
    ),
  ].sort();
  const out = {
    source: "https://github.com/disposable-email-domains/disposable-email-domains (CC0)",
    fetched: new Date().toISOString().slice(0, 10),
    domains,
  };
  writeFileSync(jsonPath, `${JSON.stringify(out, null, 2)}\n`);
  console.error(`wrote ${domains.length} domains to ${path.relative(root, jsonPath)}`);
} else {
  const { domains, source, fetched } = JSON.parse(readFileSync(jsonPath, "utf8"));
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  process.stdout.write(
    `-- ${domains.length} domains from ${source}, fetched ${fetched} (lib/disposable-email-domains.json).\n` +
      `insert into public.blocked_email_domains (domain) values\n` +
      domains.map((d) => `  (${q(d)})`).join(",\n") +
      `\non conflict do nothing;\n`,
  );
}
