import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { signInAsGoogle, signInWithEmail } from "./helpers/email";
import { E2E_EMAIL_DOMAIN } from "./helpers/mailbox";
import { adminSignIn } from "./helpers/admin";

// Ask Bolton (community questions). Fixture (supabase/tests/fixtures/e2e.sql), all man & van: Hill Top Removals (with
// WhatsApp) and Brook Removals get recommended; Helper Removals is linked to its trader here, who says "I can help";
// question e401 was asked 15 days ago, so it's closed. Other specs don't touch questions, but each test here uses its
// own accounts and text, so they can run side by side.
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = (query: string) =>
  execFileSync("psql", [DB_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", query]).toString().trim();

const HILLTOP = "00000000-0000-0000-0000-00000000e221";
const HELPER = "00000000-0000-0000-0000-00000000e223";
const CLOSED = "00000000-0000-0000-0000-00000000e401";
// Letters only: ten or more digits in a row would read as a phone number.
const tag = () => Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 6);

async function newPage(browser: Browser, testInfo: TestInfo, userAgent?: string) {
  const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, ...(userAgent ? { userAgent } : {}) });
  return ctx.newPage();
}

/** Asks on /ask/new (man & van by default) and returns the new question's id. */
async function ask(page: Page, body: string, district = "BL3") {
  await page.goto("/ask/new?category=man-and-van");
  const form = page.getByRole("form", { name: "Your question" });
  await expect(form.getByLabel("Which trade?")).toHaveValue(/[0-9a-f-]{36}/);
  await form.getByLabel("Where?").selectOption(district);
  await form.getByRole("textbox", { name: /^Your question/ }).fill(body);
  await form.getByRole("button", { name: "Post question" }).click();
}

test("a resident asks, neighbours recommend, the trader says they can help, and a tap counts as an enquiry", async ({
  page,
  browser,
}, testInfo) => {
  const body = `Anyone know a good man and van for a sofa in BL3? ${tag()}`;

  // Entry points: the directory home and the category page.
  await page.goto("/");
  const card = page.getByRole("region", { name: "Can't find who you need?" });
  await expect(card.getByRole("link", { name: "Ask", exact: true })).toHaveAttribute("href", "/ask/new");
  await expect(card.getByRole("link", { name: "Ask Bolton" })).toHaveAttribute("href", "/ask");
  await page.goto("/c/man-and-van");
  await expect(page.getByRole("link", { name: /Can't decide\? Ask Bolton/ })).toHaveAttribute(
    "href",
    "/ask/new?category=man-and-van",
  );

  // Asking needs sign-in; the form refuses a phone number, then posts.
  await signInAsGoogle(page, `asker-q1@${E2E_EMAIL_DOMAIN}`, { first: "Asha", surname: "Asker", next: "/ask/new" });
  await ask(page, "Ring me on 07700 900 123 for a sofa move");
  await expect(page.getByText("Please leave phone numbers out.", { exact: false })).toBeVisible();
  await ask(page, body);
  await page.waitForURL(/\/ask\/[0-9a-f-]{36}$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(body);
  await expect(page.getByText("Asked by Asha A. on")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  // On the public list, cookie-free, with the trade and area chips.
  const visitor = await newPage(browser, testInfo, "E2E question visitor");
  const res = await visitor.goto("/ask");
  expect(res?.headers()["set-cookie"]).toBeUndefined();
  const list = visitor.getByTestId("question-list");
  await expect(list.getByRole("link", { name: new RegExp(body.slice(0, 40).replace(/[?]/g, "\\?")) })).toBeVisible();
  await visitor.getByRole("group", { name: "Area" }).getByRole("button", { name: "BL1", exact: true }).click();
  await expect(visitor.getByText(body)).toHaveCount(0);
  await visitor.getByRole("group", { name: "Area" }).getByRole("button", { name: "BL3", exact: true }).click();
  await expect(visitor.getByText(body)).toBeVisible();

  // Two residents recommend Hill Top (one with an email-code account: answers aren't held), one recommends Brook.
  for (const [who, pick, note] of [
    ["bea", "Hill Top Removals", "Moved my nan's flat, careful lads."],
    ["cy", "Hill Top Removals", ""],
    ["dot", "Brook Removals", ""],
  ] as const) {
    const p = await newPage(browser, testInfo);
    const signIn = who === "cy" ? signInWithEmail : signInAsGoogle;
    await signIn(p, `${who}-q1@${E2E_EMAIL_DOMAIN}`, { first: who, surname: who === "dot" ? "Doe" : "Bee", next: `/ask/${id}/answer` });
    const form = p.getByRole("form", { name: "Recommend someone" });
    await form.getByRole("searchbox").fill(pick.split(" ")[0]);
    await expect(form.getByTestId("provider-picker").getByRole("radio")).toHaveCount(1);
    await form.getByRole("radio", { name: new RegExp(pick) }).check();
    if (note) await form.getByLabel(/Why them\?/).fill(note);
    await form.getByRole("button", { name: "Recommend them" }).click();
    await p.waitForURL(new RegExp(`/ask/${id}$`));
    await p.context().close();
  }

  await visitor.goto(`/ask/${id}`);
  const recs = visitor.getByTestId("recommendations").getByRole("article");
  await expect(recs).toHaveCount(2);
  const hill = recs.first();
  await expect(hill).toHaveAccessibleName("Hill Top Removals");
  await expect(hill).toContainText("Recommended by 2 people: Bea B. and Cy B.");
  await expect(hill).toContainText("Moved my nan's flat, careful lads.");
  await expect(recs.nth(1)).toContainText("Recommended by 1 person: Dot D.");
  // Indexable now it has a recommendation.
  await expect(visitor.locator('meta[name="robots"]')).toHaveCount(0);

  // The trader: linked to Helper Removals. Their own listing isn't offered, a forged pick is refused, and "I can help"
  // shows apart, as the trader speaking for themselves.
  const trader = await newPage(browser, testInfo);
  await signInAsGoogle(trader, `helper-trader@${E2E_EMAIL_DOMAIN}`, { first: "Hel", surname: "Helper" });
  sql(`update public.providers set user_id = (select id from auth.users where email = 'helper-trader@${E2E_EMAIL_DOMAIN}')
       where id = '${HELPER}'`);
  await trader.goto(`/ask/${id}/answer`);
  const recForm = trader.getByRole("form", { name: "Recommend someone" });
  await expect(recForm.getByRole("radio", { name: /Helper Removals/ })).toHaveCount(0);
  await expect(trader.getByText("Your own listing isn't in the list.")).toBeVisible();
  await trader.evaluate((own) => {
    const r = document.querySelector<HTMLInputElement>('form[aria-label="Recommend someone"] input[name="provider_id"]')!;
    r.value = own;
    r.checked = true;
  }, HELPER);
  await recForm.getByRole("button", { name: "Recommend them" }).click();
  await expect(recForm.getByText("You can't recommend your own business. Tap “I can help” instead.")).toBeVisible();
  const help = trader.getByRole("form", { name: "I can help" });
  await help.getByLabel(/A short note/).fill("Free this week, BL3 is fine.");
  await help.getByRole("button", { name: "I can help (as Helper Removals)" }).click();
  await trader.waitForURL(new RegExp(`/ask/${id}$`));

  await visitor.reload();
  const self = visitor.getByTestId("can-help").getByRole("article", { name: "Helper Removals says they can help" });
  await expect(self).toContainText("The trader, speaking for themselves");
  await expect(self).toContainText("Free this week, BL3 is fine.");
  await expect(visitor.getByTestId("recommendations")).not.toContainText("Helper Removals");
  // No phone number anywhere in the page.
  expect(await visitor.content()).not.toMatch(/7700\s?900\s?32[13]/);

  // Call from the question page goes through /api/contact and counts as an enquiry.
  const before = Number(sql(`select count(*) from public.contact_events where provider_id = '${HILLTOP}'`));
  const call = hill.getByRole("link", { name: "Call Hill Top Removals" });
  await expect(call).toHaveAttribute("rel", "nofollow");
  const href = (await call.getAttribute("href"))!;
  expect(href).toBe("/api/contact/e2e-hilltop-vans?via=call");
  const tap = await visitor.request.get(href, { maxRedirects: 0 });
  expect(tap.status()).toBe(302);
  expect(tap.headers().location).toBe("tel:+447700900321");
  expect(Number(sql(`select count(*) from public.contact_events where provider_id = '${HILLTOP}'`))).toBe(before + 1);
  await expect(hill.getByRole("link", { name: "WhatsApp Hill Top Removals" })).toHaveAttribute(
    "href",
    "/api/contact/e2e-hilltop-vans?via=whatsapp",
  );
});

test("typing the question picks the trade and shows who's already listed for the area", async ({ page }) => {
  await signInAsGoogle(page, `matcher-q@${E2E_EMAIL_DOMAIN}`, { first: "Mo", surname: "Match", next: "/ask/new" });
  const form = page.getByRole("form", { name: "Your question" });
  const trade = form.getByLabel("Which trade?");
  await expect(trade).toHaveValue("");

  // "man and van" in the words picks Man & van; Hill Top covers BL5, so the panel lists traders with Call buttons.
  await form.getByRole("textbox", { name: /^Your question/ }).fill("Anyone know a man and van for Saturday?");
  await expect(trade.locator("option:checked")).toHaveText("Man & van, removals");
  await expect(form.getByTestId("trade-guessed")).toBeVisible();
  await form.getByLabel("Where?").selectOption("BL5");
  const matches = form.getByTestId("ask-matches");
  await expect(matches.getByRole("heading", { name: /^Already listed for BL5: \d+ traders?$/ })).toBeVisible();
  await expect(matches.getByRole("link", { name: /^Call / }).first()).toHaveAttribute("href", /^\/api\/contact\/e2e-/);

  // A trade nobody covers says so, and posting is the way on.
  await form.getByRole("textbox", { name: /^Your question/ }).fill("Who does a cheap MOT round here?");
  await expect(trade.locator("option:checked")).toHaveText("MOT test");
  await expect(matches).toContainText("Nobody listed covers BL5 for MOT test yet.");

  // Once the person picks a trade themselves, the words no longer change it.
  await trade.selectOption({ label: "Plumber" });
  await expect(form.getByTestId("trade-guessed")).toHaveCount(0);
  await form.getByRole("textbox", { name: /^Your question/ }).fill("Anyone know a man and van?");
  await expect(trade.locator("option:checked")).toHaveText("Plumber");
});

test("a question from an email-code account waits for the admin, then goes up", async ({ page, browser }, testInfo) => {
  const body = `Need a man and van for a fridge freezer please ${tag()}`;
  await signInWithEmail(page, `held-q@${E2E_EMAIL_DOMAIN}`, { first: "Holly", surname: "Held", next: "/ask/new" });
  await expect(page.getByText("we'll give your question a quick check before it goes up")).toBeVisible();
  await ask(page, body, "BL2");
  await expect(page.getByRole("heading", { name: "Question sent" })).toBeVisible();

  const visitor = await newPage(browser, testInfo);
  await visitor.goto("/ask");
  await expect(visitor.getByText(body)).toHaveCount(0);

  await adminSignIn(page);
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: /^Questions/ }).click();
  const held = page.getByRole("article", { name: "Held question from Holly H." });
  await expect(held).toContainText(body);
  await expect(held).toContainText("signs in with an email code");
  await held.getByRole("button", { name: "Approve" }).click();
  // Approved, it leaves the queue.
  await expect(held).toHaveCount(0);
  expect(sql(`select count(*) from public.audit_log a join public.questions q on q.id::text = a.target_id
              where a.action = 'approve_question' and q.body = '${body}'`)).toBe("1");

  await visitor.reload();
  await expect(visitor.getByText(body)).toBeVisible();
});

test("a reported recommendation is removed by the admin and disappears", async ({ page, browser }, testInfo) => {
  const body = `Who is good for a house clearance near BL6? ${tag()}`;
  const note = `Brook are great, ask for Bri ${tag()}`;
  // Asked by Jo B. and answered by Sam T. (fixture residents), straight into the database.
  const id = sql(`insert into public.questions (asker_id, category_id, district, body, status, published_at)
    values ('00000000-0000-0000-0000-00000000e302', (select id from public.categories where slug = 'man-and-van'),
            'BL6', '${body}', 'published', now()) returning id`).split("\n")[0];
  sql(`insert into public.question_answers (question_id, author_id, kind, provider_id, note)
       values ('${id}', '00000000-0000-0000-0000-00000000e303', 'recommend', '00000000-0000-0000-0000-00000000e222', '${note}')`);

  await signInAsGoogle(page, `reporter-q@${E2E_EMAIL_DOMAIN}`, { first: "Rory", surname: "Report" });
  await page.goto(`/ask/${id}`);
  const brook = page.getByTestId("recommendations").getByRole("article", { name: "Brook Removals" });
  await expect(brook).toContainText(note);
  await brook.getByText("Report", { exact: true }).click();
  await brook.getByRole("link", { name: "Report Sam T.'s recommendation" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Something wrong with Sam T.'s recommendation?");
  await page.getByLabel("What's wrong with it?").fill("Reads like an advert");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("heading", { name: "Report sent" })).toBeVisible();

  const admin = await newPage(browser, testInfo);
  await adminSignIn(admin);
  await admin.goto("/admin/questions");
  const reported = admin.getByRole("article").filter({ hasText: note });
  await expect(reported).toContainText("Reads like an advert");
  await expect(reported).toContainText("Sam T. recommends Brook Removals");
  await reported.getByRole("button", { name: "Remove answer" }).click();
  await expect(reported.getByText("Enter a reason. It's kept in the audit log.")).toBeVisible();
  await reported.getByLabel("Reason for removing").fill("Advert for a friend's firm");
  await reported.getByRole("button", { name: "Remove answer" }).click();
  await expect(admin.getByRole("article").filter({ hasText: note })).toHaveCount(0);
  expect(sql(`select count(*) from public.audit_log where action = 'remove_question_answer' and reason = 'Advert for a friend''s firm'`)).toBe("1");

  await page.goto(`/ask/${id}`);
  await expect(page.getByText(note)).toHaveCount(0);
  await expect(page.getByTestId("recommendations")).toHaveCount(0);
  await expect(page.getByText("No recommendations yet.")).toBeVisible();
});

test("a question closes 14 days after it was asked: still readable, no new answers", async ({ page }) => {
  await page.goto(`/ask/${CLOSED}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anyone know a man and van for a piano? Closed fixture question.");
  await expect(page.locator(".qhead .qstate")).toHaveText("Closed");
  await expect(page.getByText(/This question closed on .+, so it can't take new answers\./)).toBeVisible();
  await expect(page.getByRole("link", { name: "Recommend someone" })).toHaveCount(0);
  await expect(page.getByTestId("recommendations")).toContainText("Recommended by 1 person: Kim D.");

  await signInAsGoogle(page, `late-q@${E2E_EMAIL_DOMAIN}`, { first: "Lee", surname: "Late", next: `/ask/${CLOSED}/answer` });
  await expect(page.getByText("This question has closed, so it can't take new answers.")).toBeVisible();
  await expect(page.getByRole("form", { name: "Recommend someone" })).toHaveCount(0);
});
