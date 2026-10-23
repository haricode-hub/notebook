import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { signUpAndVerifyIfConfigured } from "./helpers/auth";

test("research desk remains accessible across themes and narrow screens", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const existingTestEmail = process.env.E2E_EXISTING_TEST_EMAIL;
  if (existingTestEmail) {
    if (!existingTestEmail.endsWith("@example.test")) throw new Error("Existing account must be a synthetic test account");
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(existingTestEmail);
    await page.getByLabel("Password", { exact: true }).fill("strong-test-password-123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/notebooks$/);
  } else {
  await page.goto("/sign-up");
  await signUpAndVerifyIfConfigured(page, {
    name: "Research desk check", email: `research-desk-${Date.now()}@example.test`,
    password: "strong-test-password-123",
  });
  }
  await page.getByRole("button", { name: "New notebook", exact: true }).click();
  await page.getByLabel("New notebook title").fill("Field notes");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Field notes", exact: true }).click();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
      await expect(page.getByRole("heading", { name: "Turn your sources into understanding." })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (root: Element, options: object) => Promise<{ violations: { id: string; help: string }[] }> } }).axe;
        const root = document.querySelector('section[aria-label="Chat"]');
        if (!root) throw new Error("Chat was not rendered");
        return (await axe.run(root, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations;
      });
      expect(violations).toEqual([]);
      await page.screenshot({ path: `../../docs/design/current/research-desk-${width}-${theme}.png` });
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const question = page.getByRole("button", { name: "What are the key ideas in my sources?" });
  await question.focus();
  await expect.poll(() => question.locator("svg").evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  await page.getByLabel("Ask your sources").fill("Summarize the evidence");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
