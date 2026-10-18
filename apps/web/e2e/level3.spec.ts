import { expect, test } from "@playwright/test";

test("grounded chat cites an uploaded document and respects source selection", async ({ page }) => {
  const authIp = `198.18.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }));
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Level Three Tester");
  await page.getByLabel("Email").fill(`level3-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("strong-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/notebooks$/);
  await page.getByLabel("New notebook title").fill("Launch notes");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Launch notes" }).click();

  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByLabel("PDF, DOCX, PPTX, TXT or MD").setInputFiles({
    name: "launch.txt", mimeType: "text/plain", buffer: Buffer.from("The launch code is BLUEBIRD-42.")
  });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const card = page.locator("li:visible").filter({ hasText: "launch.txt" });
  await expect(card.getByText(/^ready$/i)).toBeVisible({ timeout: 60_000 });

  await page.getByLabel("Ask your sources").fill("What is the launch code?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("region", { name: "Chat" }).locator("article").filter({ hasText: "BLUEBIRD-42" })).toBeVisible();
  const chip = page.getByRole("button", { name: "Source 1: launch.txt" });
  await expect(chip).toBeVisible();
  await chip.hover();
  await expect(page.getByRole("note")).toContainText("BLUEBIRD-42");
  await expect(page.getByLabel("Model fake")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Source 1: launch.txt" })).toBeVisible();
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/sources/")),
    card.getByRole("checkbox", { name: "Use launch.txt in chat" }).uncheck(),
  ]);
  await expect(card.getByRole("checkbox", { name: "Use launch.txt in chat" })).not.toBeChecked();
  await page.getByLabel("Ask your sources").fill("What is the launch code?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("I couldn't find that in your sources.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Source 1: launch.txt" })).toHaveCount(1);

  await page.getByRole("button", { name: "Clear chat" }).click();
  await expect(page.getByText("Ask about your sources")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Ask about your sources")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
