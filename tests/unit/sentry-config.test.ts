import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Sentry collects user details, cookies, headers, request bodies and query strings unless told not to. Ours must send
// none of them (the privacy notice says so), on the server and in the browser, and stay off without a DSN.
describe("Sentry sends no personal data", () => {
  for (const file of ["instrumentation.ts", "instrumentation-client.ts"]) {
    it(file, () => {
      const src = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src).toContain(
        "dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false }",
      );
      expect(src).toContain("tracesSampleRate: 0");
      expect(src).toMatch(/if \(!?dsn\)/);
      expect(src).not.toMatch(/replayIntegration|replaysSessionSampleRate|replaysOnErrorSampleRate/);
    });
  }
});
