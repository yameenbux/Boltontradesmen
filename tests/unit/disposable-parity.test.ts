import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import list from "@/lib/disposable-email-domains.json";

// The database's blocked_email_domains is seeded from lib/disposable-email-domains.json by
// scripts/disposable-domains-sql.mjs. The newest such migration must hold exactly the JSON's domains.
const dir = path.resolve(__dirname, "../../supabase/migrations");

function newestMigration(): string {
  const files = readdirSync(dir)
    .filter((f) => f.includes("disposable_email_domains") && f.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error("no disposable_email_domains migration");
  return readFileSync(path.join(dir, files[files.length - 1]), "utf8");
}

describe("disposable domain list", () => {
  it("the JSON is sorted, lowercase and unique", () => {
    const d = list.domains;
    expect(d.length).toBeGreaterThan(1000);
    expect(d).toEqual([...d].sort());
    expect(d.every((x) => x === x.toLowerCase() && !/\s/.test(x))).toBe(true);
    expect(new Set(d).size).toBe(d.length);
    expect(list.source).toBe("https://github.com/disposable-email-domains/disposable-email-domains (CC0)");
    expect(list.fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("the newest migration inserts exactly the JSON's domains", () => {
    const sql = newestMigration();
    const block = /insert into public\.blocked_email_domains \(domain\) values([\s\S]*?)on conflict do nothing;/.exec(sql);
    expect(block, "insert block").not.toBeNull();
    const inserted = [...block![1].matchAll(/\('((?:[^']|'')*)'\)/g)].map((m) => m[1].replace(/''/g, "'"));
    expect(inserted).toEqual(list.domains);
  });
});
