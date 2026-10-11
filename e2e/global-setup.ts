import { execFileSync } from "node:child_process";
import path from "node:path";

// Reset the local database (migrations + seed) and load the E2E fixture providers.
// Runs after Playwright's webServer is up; pages that were prerendered or cached with
// revalidate = 300 only depend on seed data (home) or are rendered on first request.
export default function globalSetup() {
  const root = path.resolve(__dirname, "..");
  const dbUrl = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  execFileSync("bash", ["scripts/e2e-prepare.sh"], { cwd: root, stdio: "inherit", env: { ...process.env, SUPABASE_DB_URL: dbUrl } });
}
