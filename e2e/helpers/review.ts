import type { Page } from "@playwright/test";

// Fills every required answer on the review form (tidy included: the e2e providers are all in tidy trades).
export type Answers = { quality: string; comment?: string; tidy?: "Yes" | "No" };

export async function answer(page: Page, a: Answers) {
  const form = page.getByRole("form", { name: "Your review" });
  await form.getByLabel("When was the job?").selectOption({ index: 1 });
  await form
    .getByRole("group", { name: "Roughly how much was it?" })
    .getByRole("button", { name: "£250 to £1,000" })
    .click();
  await form
    .getByRole("group", { name: "Did they turn up when they said?" })
    .getByRole("button", { name: "Yes" })
    .click();
  await form.getByRole("group", { name: "Did they stick to the price?" }).getByRole("button", { name: "Yes" }).click();
  await form
    .getByRole("group", { name: "Quality of work" })
    .getByRole("button", { name: new RegExp(`^${a.quality}\\b`) })
    .click();
  await form
    .getByRole("group", { name: "Did they leave the place tidy?" })
    .getByRole("button", { name: a.tidy ?? "Yes" })
    .click();
  await form.getByRole("group", { name: "Would you use them again?" }).getByRole("button", { name: "Yes" }).click();
  if (a.comment !== undefined) await form.getByLabel(/Anything to add/).fill(a.comment);
}
