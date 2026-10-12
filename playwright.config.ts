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
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  // Two projects: everything runs with phone sign-in off (production's setting) on :3000; the phone path keeps
  // its own specs on a second server with SIGN_IN_PHONE=on (:3001).
  projects: [
    {
      name: "chromium",
      testIgnore: /(sign-in-phone|sms-hook)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3000", launchOptions: { executablePath } },
    },
    {
      name: "phone",
      testMatch: /(sign-in-phone|sms-hook)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3001", launchOptions: { executablePath } },
    },
  ],
  // Production build served with `next start`, matching CI. Playwright starts the entries in order and waits for each
  // url, so the second server reuses the first one's build.
  webServer: [
    {
      // Database is prepared before the build so prerendered pages (home) see the seed data.
      command: "bash scripts/e2e-prepare.sh && npm run build && npm run start",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { ...process.env, SIGN_IN_PHONE: "off" } as Record<string, string>,
    },
    {
      command: "npm run start -- -p 3001",
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { ...process.env, SIGN_IN_PHONE: "on" } as Record<string, string>,
    },
  ],
});
