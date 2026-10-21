import { test as setup } from "@playwright/test";
import { ADMIN_STATE, adminSignInWithCode } from "./helpers/admin";

// The admin signs in once, with password and authenticator code; the other tests reuse the session (helpers/admin.ts).
setup("the admin signs in with password and code", async ({ page }) => {
  await adminSignInWithCode(page);
  await page.context().storageState({ path: ADMIN_STATE });
});
