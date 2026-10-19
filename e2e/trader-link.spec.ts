import { expect, test, type Page } from "@playwright/test";
import { signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";

const ACE_ADMIN = "/admin/providers/00000000-0000-0000-0000-00000000e201";

async function adminSignIn(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("e2e-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
}

// Plan 2b: with phone sign-in off, a trader links their listing by opening a single-use link from the admin.
// One test, in order: the listing can only be linked once, so the steps share its state.
test("a trader links their listing with the admin's sign-in link, replies, and the link works only once", async ({
  page,
  browser,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await adminSignIn(page);
  await page.goto(ACE_ADMIN);
  const section = page.getByRole("region", { name: "Trader sign-in" });
  await section.getByRole("button", { name: "Trader sign-in link" }).click();
  await expect(section.getByText(/^Link copied\./)).toBeVisible();
  await expect(section.getByText(/^Expires on \d{1,2} \w+ \d{4}\. Works once\.$/)).toBeVisible();
  const url = await section.getByRole("textbox", { name: "Trader sign-in link" }).inputValue();
  expect(url).toMatch(/^http:\/\/localhost:3000\/link\/[0-9a-f-]{36}$/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  const path = new URL(url).pathname;

  // The trader, signed out, opens the link: sign in first, then confirm.
  const trader = await (await browser.newContext()).newPage();
  await trader.goto(path);
  await expect(trader).toHaveURL(/\/sign-in\?next=%2Flink%2F/);
  await expect(trader.getByRole("heading", { name: "Sign in to link your listing" })).toBeVisible();
  await signInWithEmail(trader, `ace@${E2E_EMAIL_DOMAIN}`, { first: "Alan", surname: "Ace", next: path });
  await expect(trader).toHaveURL(new RegExp(`${path}$`));
  await expect(trader.getByRole("heading", { level: 1 })).toHaveText("Link Ace Plumbing to your account?");
  await trader.getByRole("button", { name: "Yes, this is my business" }).click();
  await expect(trader).toHaveURL(/\/provider$/);
  await expect(trader.getByRole("heading", { level: 1 })).toContainText("Ace Plumbing");
  for (const name of ["Pat P.", "Jo B.", "Sam T.", "Ali R."]) {
    await expect(trader.getByRole("article", { name: `Review by ${name}` })).toBeVisible();
  }

  const pat = trader.getByRole("article", { name: "Review by Pat P." });
  await pat.getByRole("button", { name: "Reply to Pat" }).click();
  await pat.getByLabel("Your reply").fill("Thanks Pat, glad the boiler's behaving.");
  await expect(pat.getByText("39/400")).toBeVisible();
  await pat.getByRole("button", { name: "Post reply" }).click();
  await expect(pat.getByText("Reply posted")).toBeVisible();

  await trader.goto("/p/e2e-ace-plumbing");
  const onProfile = trader.getByRole("article", { name: "Review by Pat P." });
  await expect(onProfile.getByText("Reply from Ace Plumbing")).toBeVisible();
  await expect(onProfile).toContainText("Thanks Pat, glad the boiler's behaving.");

  await trader.goto("/p/e2e-fresh-pipes/review");
  await expect(trader.getByText("You can't review someone who works in the same trade as you.")).toBeVisible();
  await expect(trader.getByRole("form", { name: "Your review" })).toHaveCount(0);

  // Review Focus 5: the link was forwarded; the next person to open it is refused.
  const other = await (await browser.newContext()).newPage();
  await signInWithEmail(other, `not-ace@${E2E_EMAIL_DOMAIN}`, { first: "Nora", surname: "Next", next: path });
  await expect(other).toHaveURL(new RegExp(`${path}$`));
  await expect(other.getByText("This link has already been used. If that wasn't you, contact us.")).toBeVisible();
  await expect(other.getByRole("button", { name: "Yes, this is my business" })).toHaveCount(0);

  // The admin sees the listing linked and can unlink it with a reason.
  await page.reload();
  await expect(section.getByText("Linked to an account")).toBeVisible();
  await expect(section.getByRole("button", { name: "Trader sign-in link" })).toHaveCount(0);
  await section.getByRole("button", { name: "Unlink" }).click();
  await expect(section.getByText("Enter a reason. It's kept in the audit log.")).toBeVisible();
  await section.getByLabel(/Reason for unlinking/).fill("Wrong person opened the link");
  await section.getByRole("button", { name: "Unlink" }).click();
  await expect(section.getByRole("button", { name: "Trader sign-in link" })).toBeVisible();
  await trader.goto("/provider");
  await expect(trader.getByRole("heading", { name: "Tell us about your business" })).toBeVisible();
});

test("a malformed trader link says it isn't valid", async ({ page }) => {
  await signInWithEmail(page, `linkless@${E2E_EMAIL_DOMAIN}`, { first: "Lin", surname: "Less" });
  await page.goto("/link/not-a-token");
  await expect(page.getByText("This link isn't valid. Ask us for a new one.")).toBeVisible();
  await expect(page.getByRole("link", { name: "support@ysbdesigns.uk" })).toBeVisible();
});
