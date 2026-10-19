import { expect, test } from "@playwright/test";

test("live OpenRouter guide appears within 60 seconds of upload", async ({ page }) => {
  test.skip(process.env.RUN_LIVE_GUIDE !== "1", "Requires a configured live OpenRouter worker");
  test.setTimeout(90_000);
  const authIp = `198.20.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }));
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Live Guide Timer");
  await page.getByLabel("Email").fill(`live-guide-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("strong-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/notebooks$/);
  await page.getByLabel("New notebook title").fill("Live guide timing");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Live guide timing" }).click();

  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByLabel("PDF, DOCX, PPTX, TXT or MD").setInputFiles({
    name: "timed-source.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("The archive opens on Tuesday. Its index records 430 pamphlets and five early maps. The earliest map was drawn in 1894."),
  });
  const started = Date.now();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const card = page.getByRole("region", { name: "Sources" }).filter({ visible: true }).locator("li").filter({ hasText: "timed-source.txt" });
  await expect(card.getByText(/^ready$/i)).toBeVisible({ timeout: 60_000 });
  await card.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("tabpanel", { name: "Source guide" });
  await expect(guide.getByRole("heading", { name: "Summary" })).toBeVisible({ timeout: 60_000 });
  const seconds = (Date.now() - started) / 1000;
  expect(seconds, `upload-to-guide took ${seconds.toFixed(1)} seconds`).toBeLessThan(60);
  await expect(guide.getByRole("heading", { name: "Key topics" })).toBeVisible();
  await expect(guide.getByRole("button")).toHaveCount(3);
  expect(consoleErrors).toEqual([]);
  console.log(`Level 5 live upload-to-guide: ${seconds.toFixed(1)} seconds`);
});
