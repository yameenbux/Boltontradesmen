import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Plan 2b Task 12: the one-paste production scripts are generated from the migrations and must stay in step with them.
// Plan 2b is 000018..000025, the launch checklist 000026, the review card script 000027, availability 000028 and the
// trader dashboard 000029, Pro 000030 and community questions 000031 (all closed); the price guides script is 000032
// onwards, so a new migration can't be left out.
const root = process.cwd();
const all = readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const NEWEST = all[all.length - 1].slice(0, 14);

const SCRIPTS = [
  {
    file: "docs/launch/plan-2b-production.sql",
    preset: "plan-2b",
    from: "20261012000018",
    to: "20261012000025",
    functions: ["email_gate", "email_verify_gate", "claim_trader_link", "admin_list_reviews_pending", "tidy_sign_in_records"],
    requires: null,
  },
  {
    file: "docs/launch/launch-checklist-production.sql",
    preset: "launch-checklist",
    from: "20261012000026",
    to: "20261012000026",
    functions: ["submit_listing_request", "admin_list_listing_requests", "admin_set_listing_request_status"],
    requires: "20261012000025",
  },
  {
    file: "docs/launch/review-source-production.sql",
    preset: "review-source",
    from: "20261012000027",
    to: "20261012000027",
    functions: ["reviews", "source"],
    requires: "20261012000026",
  },
  {
    file: "docs/launch/availability-production.sql",
    preset: "availability",
    from: "20261012000028",
    to: "20261012000028",
    functions: ["set_my_availability", "admin_set_availability", "availability_status"],
    requires: "20261012000027",
  },
  {
    file: "docs/launch/trader-dashboard-production.sql",
    preset: "trader-dashboard",
    from: "20261012000029",
    to: "20261012000029",
    functions: ["my_enquiry_stats", "admin_enquiry_stats", "update_my_listing", "pause_my_listing", "unpause_my_listing", "withdraw_my_listing"],
    requires: "20261012000028",
  },
  {
    file: "docs/launch/pro-tier-production.sql",
    preset: "pro-tier",
    from: "20261012000030",
    to: "20261012000030",
    functions: ["stripe_apply_event", "my_pro_status", "add_my_work_photo", "admin_decide_pro_document", "id_checked", "photos"],
    requires: "20261012000029",
  },
  {
    file: "docs/launch/community-questions-production.sql",
    preset: "community-questions",
    from: "20261012000031",
    to: "20261012000031",
    functions: ["submit_question", "submit_question_answer", "admin_list_question_queue", "question_public", "question_reports"],
    requires: "20261012000030",
  },
  {
    file: "docs/launch/price-guides-production.sql",
    preset: "price-guides",
    from: "20261012000032",
    to: "20261012000032",
    functions: ["price_guide_min_reviews"],
    requires: "20261012000031",
  },
  {
    file: "docs/launch/consent-link-production.sql",
    preset: "consent-link",
    from: "20261012000033",
    to: "20261012000033",
    functions: ["consent_trader_link"],
    requires: "20261012000032",
  },
  {
    file: "docs/launch/one-listing-production.sql",
    preset: "one-listing",
    from: "20261012000034",
    to: "20261012000034",
    functions: ["providers_one_listing_per_phone"],
    requires: "20261012000033",
  },
  {
    file: "docs/launch/pro-jobs-production.sql",
    preset: "pro-jobs",
    from: "20261012000035",
    to: "20261012000035",
    functions: ["admin_grant_pro", "submit_job_request", "claim_question_alerts", "takes_requests"],
    requires: "20261012000034",
  },
  {
    file: "docs/launch/quotes-invoices-production.sql",
    preset: "quotes-invoices",
    from: "20261012000036",
    to: "20261012000036",
    functions: ["save_my_doc", "public_doc", "answer_quote", "claim_customer_message"],
    requires: "20261012000035",
  },
  {
    file: "docs/launch/trader-sign-up-production.sql",
    preset: "trader-sign-up",
    from: "20261012000037",
    to: "20261012000037",
    functions: ["my_listing_request", "admin_approve_listing_request"],
    requires: "20261012000036",
  },
  {
    file: "docs/launch/launch-hardening-production.sql",
    preset: "launch-hardening",
    from: "20261012000038",
    to: "20261012000038",
    functions: ["rate_allow", "rate_failures", "lock_grant_valid", "am_i_admin_account"],
    requires: "20261012000037",
  },
  {
    file: "docs/launch/new-categories-production.sql",
    preset: "new-categories",
    from: "20261012000039",
    to: "20261012000039",
    functions: [],
    requires: "20261012000038",
  },
  {
    file: "docs/launch/more-categories-production.sql",
    preset: "more-categories",
    from: "20261012000040",
    to: "20261012000040",
    functions: [],
    requires: "20261012000039",
  },
  {
    file: "docs/launch/auto-live-production.sql",
    preset: "auto-live",
    from: "20261012000041",
    to: "20261012000041",
    functions: ["trader_publish_listing", "trader_agree_listing", "admin_mark_provider_reviewed"],
    requires: "20261012000040",
  },
  {
    file: "docs/launch/one-step-production.sql",
    preset: "one-step",
    from: "20261012000042",
    to: "20261012000042",
    functions: [],
    requires: "20261012000041",
  },
  {
    file: "docs/launch/check-numbers-production.sql",
    preset: "check-numbers",
    from: "20261012000043",
    to: "20261012000043",
    functions: [],
    requires: "20261012000042",
  },
  {
    file: "docs/launch/plaster-recovery-production.sql",
    preset: "plaster-recovery",
    from: "20261012000044",
    to: "20261012000044",
    functions: [],
    requires: "20261012000043",
  },
  {
    file: "docs/launch/builders-production.sql",
    preset: "builders",
    from: "20261012000045",
    to: "20261012000045",
    functions: [],
    requires: "20261012000044",
  },
  {
    file: "docs/launch/air-conditioning-production.sql",
    preset: "air-conditioning",
    from: "20261012000046",
    to: "20261012000051",
    functions: [],
    requires: "20261012000045",
  },
  {
    file: "docs/launch/trader-logos-production.sql",
    preset: "trader-logos",
    from: "20261012000052",
    to: "20261012000052",
    functions: ["my_branding", "set_my_logo", "set_my_brand_color"],
    requires: "20261012000051",
  },
  {
    file: "docs/launch/pro-insights-production.sql",
    preset: "pro-insights",
    from: "20261012000053",
    to: "20261012000053",
    functions: ["record_page_view", "my_insights", "due_quote_followups", "purge_old_page_views"],
    requires: "20261012000052",
  },
  {
    file: "docs/launch/card-payments-production.sql",
    preset: "card-payments",
    from: "20261012000054",
    to: NEWEST,
    functions: ["set_my_quote_deposit", "my_card_payments", "doc_card_payment", "record_card_payment"],
    requires: "20261012000053",
  },
];

for (const s of SCRIPTS) {
  const migrations = all.filter((f) => f.slice(0, 14) >= s.from && f.slice(0, 14) <= s.to);

  function generate(): string {
    const out = path.join(mkdtempSync(path.join(tmpdir(), "bv-prod-sql-")), "out.sql");
    execFileSync(
      "node",
      ["scripts/build-production-sql.mjs", "--preset", s.preset, "--from", s.from, "--to", s.to, "--out", out],
      { cwd: root },
    );
    return readFileSync(out, "utf8");
  }

  describe(s.file, () => {
    const sql = readFileSync(path.join(root, s.file), "utf8");
    const statements = sql
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("--"));

    it("covers at least one migration", () => {
      expect(migrations.length).toBeGreaterThanOrEqual(1);
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
      for (const name of s.functions) expect(sql.slice(verify)).toContain(`'${name}'`);
    });

    it("refuses to run before the script it builds on", () => {
      const requires = sql.indexOf("do $requires$");
      if (!s.requires) {
        expect(requires).toBe(-1);
        return;
      }
      expect(requires).toBeGreaterThan(sql.indexOf("begin;"));
      expect(requires).toBeLessThan(sql.indexOf("-- ==== "));
      expect(sql).toContain(`where version = '${s.requires}'`);
    });

    it("never drops or creates a trigger on auth.users", () => {
      expect(sql).not.toMatch(/(drop|create)\s+trigger[^;]*on\s+auth\.users/i);
    });
  });
}
