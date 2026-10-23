import { expect, test } from "@playwright/test";

test("public landing page leads into the real Open Notebook service", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await expect(page.getByRole("heading", { level: 1, name: "Research that stays close to its sources." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Start a notebook/ })).toHaveAttribute("href", "/sign-up");
  await expect(page.getByRole("link", { name: "Open the workspace" })).toHaveAttribute("href", "/notebooks");
  await expect(page.getByRole("heading", { name: "Open Notebook", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
});

test("public policy pages load and the layout fits a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, offenders: Array.from(document.querySelectorAll("body *")).map((element) => ({ tag: element.tagName, className: element.getAttribute("class"), text: element.textContent?.trim().slice(0, 35), right: Math.round(element.getBoundingClientRect().right) })).filter((element) => element.right > window.innerWidth).slice(0, 12) }));
  expect(overflow.width, JSON.stringify(overflow.offenders)).toBeLessThanOrEqual(390);

  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  await expect(page.getByText(/language-model provider configured/)).toBeVisible();

  await page.getByRole("link", { name: "Contact" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Contact and support" })).toBeVisible();
});

test("public pages have no automated WCAG A/AA axe violations in light or dark themes", async ({ page }) => {
  for (const path of ["/", "/privacy", "/terms", "/cookies", "/contact"]) {
    await page.goto(path);
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    for (const theme of ["light", "dark"]) {
      await page.locator("html").evaluate((element, value) => element.setAttribute("data-theme", value), theme);
      const results = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: unknown[] }> }> } }).axe;
        return axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
      });
      expect(results.violations, `${path} ${theme}: ${JSON.stringify(results.violations)}`).toEqual([]);
    }
  }
});
