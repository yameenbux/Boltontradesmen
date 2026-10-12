import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Plan 2b Task 12: the one-paste production script is generated from the migrations and must stay in step with them.
const root = process.cwd();
const committed = path.join(root, "docs/launch/plan-2b-production.sql");
const FROM = "20261012000018";

// Every migration on this branch from 000018 on, so a new migration can't be left out of the paste.
const migrations = readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= FROM)
  .sort();
const TO = migrations[migrations.length - 1].slice(0, 14);

function generate(): string {
  const out = path.join(mkdtempSync(path.join(tmpdir(), "bv-prod-sql-")), "out.sql");
  execFileSync("node", ["scripts/build-production-sql.mjs", "--from", FROM, "--to", TO, "--out", out], { cwd: root });
  return readFileSync(out, "utf8");
}

describe("docs/launch/plan-2b-production.sql", () => {
  const sql = readFileSync(committed, "utf8");
  const statements = sql
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("--"));

  it("covers 000018 to 000023 at least", () => {
    expect(migrations.length).toBeGreaterThanOrEqual(6);
    expect(TO >= "20261012000023").toBe(true);
  });

  it("is exactly what the generator writes from the migrations (regenerate it after changing one)", () => {
    expect(generate()).toBe(sql);
  });

  it("is one transaction: its SQL starts with begin; and commits before the closing check", () => {
    expect(statements[0]).toBe("begin;");
    const commit = statements.lastIndexOf("commit;");
    expect(commit).toBeGreaterThan(0);
    expect(statements.slice(commit + 1).join("\n")).toMatch(/^select /);
    expect(statements.filter((l) => /^\s*(begin|commit|rollback)\s*;/i.test(l))).toEqual(["begin;", "commit;"]);
  });

  it("contains every migration's banner, in order, and records each in schema_migrations", () => {
    let at = -1;
    for (const f of migrations) {
      const banner = sql.indexOf(`-- ==== ${f}`);
      expect(banner, f).toBeGreaterThan(at);
      at = banner;
      const version = f.slice(0, 14);
      const name = f.slice(15, -4);
      expect(sql).toContain(
        `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}') on conflict do nothing;`,
      );
    }
  });

  it("has the verification block before commit", () => {
    const verify = sql.indexOf("do $verify$");
    expect(verify).toBeGreaterThan(sql.lastIndexOf("-- ==== "));
    expect(verify).toBeLessThan(sql.lastIndexOf("commit;"));
    for (const name of ["email_gate", "email_verify_gate", "claim_trader_link", "admin_list_reviews_pending", "tidy_sign_in_records"]) {
      expect(sql.slice(verify)).toContain(`'${name}'`);
    }
  });

  it("never drops or creates a trigger on auth.users", () => {
    expect(sql).not.toMatch(/(drop|create)\s+trigger[^;]*on\s+auth\.users/i);
  });
});
