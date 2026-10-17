import { expect, test } from "@playwright/test";

test("shows healthy API and embed with no console errors", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Workspace foundation" })).toBeVisible();
  await expect(page.getByLabel("API ok")).toBeVisible();
  await expect(page.getByLabel("Embeddings ok")).toBeVisible();
  await expect(page.getByRole("link", { name: "Refresh status" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("readiness.png"), fullPage: true });
  expect(errors).toEqual([]);
});
