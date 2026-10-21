import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Automated accessibility check (axe-core, WCAG 2.2 A and AA rules) on the customer home page, in both themes
// and at phone and desktop widths. axe catches roughly a third of real problems; it doesn't replace testing with people.
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

type AxeViolation = { id: string; impact: string | null; help: string; nodes: { target: string[] }[] };

async function violations(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: AXE });
  const found = (await page.evaluate(async () => {
    // @ts-expect-error axe is injected above
    const r = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] });
    return r.violations;
  })) as AxeViolation[];
  return found.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const [label, width] of [["phone", 390], ["desktop", 1280]] as const) {
    test(`home page has no axe violations (${colorScheme}, ${label})`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme, viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.goto("/");
      await page.getByRole("heading", { level: 1 }).waitFor();
      expect(await violations(page)).toEqual([]);
      await context.close();
    });
  }
}
