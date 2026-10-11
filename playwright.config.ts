import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

// Local defaults from .env.example (already-set variables win, e.g. in CI).
for (const line of readFileSync(".env.example", "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

// PW_CHROMIUM_PATH lets sandboxes point at a pre-installed Chromium.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  // Production build served with `next start`, matching CI.
  webServer: {
    // Database is prepared before the build so prerendered pages (home) see the seed data.
    command: "bash scripts/e2e-prepare.sh && npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
