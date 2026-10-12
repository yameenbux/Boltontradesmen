import { expect, test } from "@playwright/test";

const policies = [
  { path: "/privacy", heading: /privacy/i },
  { path: "/terms", heading: /terms/i },
  { path: "/how-ratings-work", heading: /ratings work/i },
  { path: "/review-policy", heading: /^Review policy$/ },
  { path: "/fake-reviews-policy", heading: /^Fake reviews policy$/ },
  { path: "/cookies", heading: /^Cookies$/ },
];

for (const { path, heading } of policies) {
  test(`${path} returns 200 with an h1 and the draft banner`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByText("Draft — pending legal review")).toBeVisible();
  });
}

for (const start of ["/", "/platform", "/privacy", "/terms", "/how-ratings-work", "/review-policy", "/fake-reviews-policy", "/cookies", "/admin/login"]) {
  test(`footer on ${start} links to the policy pages`, async ({ page }) => {
    await page.goto(start);
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    await expect(footer.getByRole("link", { name: "How ratings work" })).toHaveAttribute(
      "href",
      "/how-ratings-work",
    );
    await expect(footer.getByRole("link", { name: "Review policy" })).toHaveAttribute("href", "/review-policy");
    await expect(footer.getByRole("link", { name: "Fake reviews" })).toHaveAttribute("href", "/fake-reviews-policy");
    await expect(footer.getByRole("link", { name: "Cookies" })).toHaveAttribute("href", "/cookies");
  });
}

test("the fake reviews policy names the law and carries a dated risk assessment", async ({ page }) => {
  await page.goto("/fake-reviews-policy");
  const main = page.locator("main");
  await expect(main).toContainText("Digital Markets, Competition and Consumers Act 2024");
  await expect(main).toContainText("Risk assessment: 12 October 2026");
});

test("the review policy explains the quick check and Verified job", async ({ page }) => {
  await page.goto("/review-policy");
  const main = page.locator("main");
  await expect(main).toContainText("Published, under a quick check");
  await expect(main).toContainText("Verified job");
});

test("the privacy notice covers signed-in people: Google, Resend and the 12 months", async ({ page }) => {
  await page.goto("/privacy");
  const main = page.locator("main");
  await expect(main).toContainText("Resend sends our sign-in emails.");
  await expect(main).toContainText("scrambled fingerprint of your sign-in");
  await expect(main).toContainText("12 months");
  await expect(main).toContainText("Proof files are deleted 12 months after we check them.");
  await expect(main).not.toContainText("Cookies are used only for the admin login");
});

test("terms and how ratings work speak in the present tense", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.locator("main")).toContainText("where residents leave reviews");
  await page.goto("/how-ratings-work");
  await expect(page.locator("main")).toContainText("Profiles show figures worked out from residents' reviews.");
  await expect(page.locator("main")).not.toContainText(/once|will mean|will also/i);
});

test("privacy notice covers controller, rights and the ICO", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByText("ico.org.uk").first()).toBeVisible();
  await expect(page.getByText("hello@example.com").first()).toBeVisible();
});

for (const path of ["/privacy", "/terms"]) {
  test(`${path} names YSB Designs and the registered company, and no person`, async ({ page }) => {
    await page.goto(path);
    const main = page.locator("main");
    await expect(main).toContainText("Bolton Vouched is a YSB Designs platform.");
    await expect(main).toContainText("YSB Ventures Ltd, registered in England and Wales, company number 16022339.");
    await expect(main).not.toContainText(/yameen/i);
  });
}

test("how ratings work states the minimum and that payment never affects ranking", async ({ page }) => {
  await page.goto("/how-ratings-work");
  await expect(page.getByText("Payment never affects ranking").first()).toBeVisible();
  await expect(page.getByText(/3 reviews/).first()).toBeVisible();
  // The order is the quality score, then the number of reviews, then the most recent review (lib/directory.ts).
  await expect(page.getByRole("heading", { name: "How lists are ordered" })).toBeVisible();
  await expect(page.getByText(/highest quality score first\. If two have the same score/)).toBeVisible();
});

for (const { path } of policies) {
  test(`${path} shows no literal HTML entities`, async ({ page }) => {
    await page.goto(path);
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("&apos;");
    expect(text).not.toContain("&amp;");
  });
}

for (const path of ["/privacy", "/admin/login"]) {
  test(`no horizontal scroll at 360px on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

// Final review 2 minors: the policies say only what the site really does.
test("policies are precise about same-trade reviews, sign-in details and reporting", async ({ page }) => {
  await page.goto("/fake-reviews-policy");
  await expect(page.getByRole("main")).toContainText(
    "Providers can't review their own listing, or anyone who works in the same trade, once they're linked to their listing.",
  );
  await page.goto("/privacy");
  await expect(page.getByRole("main")).not.toContainText("used only to send your sign-in codes");
  await expect(page.getByRole("main")).toContainText("We use them to sign you in and to limit sign-in attempts.");
  await page.goto("/terms");
  await expect(page.getByRole("main")).toContainText("tap Report on that review (you need to be signed in), or email");
});

// Plan 2b: sign-in moved to Google and email codes; the privacy notice names the new processors.
test("the privacy notice names Google and Resend, and not Twilio", async ({ page }) => {
  await page.goto("/privacy");
  const main = page.getByRole("main");
  await expect(main).toContainText("Resend");
  await expect(main).toContainText("Google account ID");
  await expect(main).not.toContainText("Twilio");
});

test("the fake reviews policy says email-only reviews are checked first", async ({ page }) => {
  await page.goto("/fake-reviews-policy");
  await expect(page.getByRole("main")).toContainText("checked by us before they appear");
  await expect(page.getByRole("main")).toContainText("sign-in moved from mobile numbers to Google and email codes");
});

// Plan 2b final review I1: the notice says sign-in records hold the address or number as typed, and how long.
test("the privacy notice is plain about sign-in records and unused accounts", async ({ page }) => {
  await page.goto("/privacy");
  const main = page.getByRole("main");
  await expect(main).not.toContainText("a scrambled form of your email address");
  await expect(main).toContainText("the email address or mobile number that was entered");
  await expect(main).toContainText("kept for up to 30 days");
  await expect(main).toContainText("deleted after 24 hours");
  await expect(main).not.toContainText("35 days");
});

// Final review M4, M5: no overclaims about surnames, Google's role or the fingerprint.
test("the privacy notice is accurate about surnames, Google and the sign-in fingerprint", async ({ page }) => {
  await page.goto("/privacy");
  const main = page.getByRole("main");
  await expect(main).not.toContainText("we do not keep your full surname");
  await expect(main).toContainText("our sign-in provider holds the name Google shares");
  await expect(main).toContainText("Google is an independent controller for your Google account");
  await expect(main).not.toContainText("can't be turned back into them");
  await expect(main).toContainText("made with a secret key, and used only to recognise the same sign-in");
});

// Launch checklist: the terms say who we are, when accounts can be suspended, our liability, changes and the law.
test("the terms cover who we are, suspension, liability, changes and the courts", async ({ page }) => {
  await page.goto("/terms");
  const main = page.getByRole("main");
  await expect(main).toContainText("Last updated: 12 October 2026.");
  for (const heading of ["Who we are", "Accounts and suspension", "Our liability", "Changes to these terms", "Law and courts"]) {
    await expect(main.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect(main).toContainText("company number 16022339");
  await expect(main).toContainText("death or personal injury caused by our negligence, or for fraud");
  await expect(main).toContainText("courts of England and Wales");
  await expect(main).toContainText("Scotland or Northern Ireland");
});

// Launch checklist: no cookie banner, and the page says why: sign-in cookies, local storage, Turnstile, analytics.
test("the cookies page lists the sign-in cookies and what's kept on the device", async ({ page }) => {
  await page.goto("/cookies");
  const main = page.getByRole("main");
  await expect(main).toContainText("doesn't show a cookie banner");
  const table = main.getByRole("table");
  await expect(table).toContainText("auth-token");
  await expect(table).toContainText("code-verifier");
  await expect(main).toContainText("bv-theme");
  await expect(main).toContainText("bv-review-draft:");
  await expect(main).toContainText("Cloudflare Turnstile");
  await expect(main).toContainText("Cloudflare Web Analytics");
});

test("no horizontal scroll at 360px on /cookies", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/cookies");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// Launch checklist: the privacy notice names Cloudflare, local storage and listing requests, and links /cookies.
test("the privacy notice covers Cloudflare, local storage and listing requests", async ({ page }) => {
  await page.goto("/privacy");
  const main = page.getByRole("main");
  await expect(main).toContainText("Supabase, Resend and Cloudflare act for us as processors.");
  await expect(main).toContainText("local storage");
  await expect(main.getByRole("link", { name: "cookies page" })).toHaveAttribute("href", "/cookies");
  await expect(main).toContainText("Traders who ask to be listed");
  await expect(main).toContainText("A request to be listed is deleted 90 days after you send it");
});
