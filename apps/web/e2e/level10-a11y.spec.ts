import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

type AxeResult = { violations: { id: string; impact: string | null; help: string }[] };

for (const route of ["/", "/sign-in"]) {
  test(`axe reports no critical accessibility issues on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.addScriptTag({ path: resolve(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const results = await page.evaluate(async () => {
      const axe = (window as unknown as Window & {
        axe: { run: (root: Document) => Promise<AxeResult> };
      }).axe;
      return axe.run(document);
    });
    expect(results.violations.filter((violation) => violation.impact === "critical")).toEqual([]);
  });
}

test("axe reports no critical accessibility issues in a signed-in workspace", async ({ page }) => {
  const authIp = `198.18.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) =>
    route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }),
  );
  await page.goto("/notebooks");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Level 10 Accessibility Check");
  await page.getByLabel("Email").fill(`level10-a11y-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("strong-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/notebooks$/);
  await page.getByLabel("New notebook title").fill("Accessibility workspace");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Accessibility workspace" }).click();
  await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
  await page.addScriptTag({ path: resolve(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const results = await page.evaluate(async () => {
    const axe = (window as unknown as Window & {
      axe: { run: (root: Document) => Promise<AxeResult> };
    }).axe;
    return axe.run(document);
  });
  expect(results.violations.filter((violation) => violation.impact === "critical")).toEqual([]);
});
