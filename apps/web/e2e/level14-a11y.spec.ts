import { expect, test } from "@playwright/test";

test("sign-in has no WCAG A/AA axe violations", async ({ page }) => {
  await page.goto("/sign-in");
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const results = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: unknown[] }> }> } }).axe;
    return axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
  });
  expect(results.violations, JSON.stringify(results.violations)).toEqual([]);
});

test("reduced motion removes press transforms", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sign-in");
  const submit = page.locator('button[type="submit"]');
  await submit.hover();
  await page.mouse.down();
  await expect.poll(() => submit.evaluate((button) => getComputedStyle(button).transform)).toBe("none");
  await page.mouse.up();
});
