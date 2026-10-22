import { expect, test } from "@playwright/test";
import { signUpAndVerifyIfConfigured } from "./helpers/auth";

test("discover a source and share a notebook read-only", async ({ page, context }) => {
  test.setTimeout(180_000);
  const authIp = `198.19.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }));
  await page.route(/\/notebooks\/[^/]+\/discover\?/, (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ title: "A useful study", url: "https://example.org/study", snippet: "Fixture result" }]),
    });
  });
  await page.route("**/notebooks/*/sources/import", (route) => route.fulfill({ status: 202, contentType: "application/json", body: "[]" }));

  await page.goto("/sign-up");
  await signUpAndVerifyIfConfigured(page, { name: "Level Nine Tester", email: `level9-${Date.now()}@example.test`, password: "strong-test-password-123" });
  await page.getByLabel("New notebook title").fill("Level Nine share fixture");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Level Nine share fixture" }).click();

  await page.getByRole("region", { name: "Sources" }).filter({ visible: true }).getByRole("button", { name: "Add source" }).first().click();
  await page.getByRole("tab", { name: "Discover" }).click();
  await page.getByLabel("Search the web").fill("chart research");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("A useful study")).toBeVisible();
  await page.getByLabel(/A useful study/).check();
  await page.getByRole("button", { name: "Import 1 selected" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("region", { name: "Sources" }).filter({ visible: true }).getByRole("button", { name: "Add source" }).first().click();
  await page.getByRole("tab", { name: "File" }).click();
  await page.getByLabel(/PDF, DOCX/).setInputFiles({
    name: "share-fixture.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("The chart records a steady rise in quarterly revenue."),
  });
  await page.getByRole("dialog", { name: "Add sources" }).getByRole("button", { name: "Add source", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "share-fixture.txt" }).getByText(/^ready$/i)).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Create share link" }).click();
  const shareUrl = await page.getByRole("textbox", { name: "Share link" }).inputValue();
  const visitor = await context.newPage();
  await visitor.goto(shareUrl);
  await expect(visitor.getByText("Shared read-only notebook")).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "Level Nine share fixture" })).toBeVisible();
  await expect(visitor.getByText("The chart records a steady rise in quarterly revenue.")).toBeVisible();
  await expect(visitor.getByRole("button")).toHaveCount(0);

  await page.getByRole("button", { name: "Revoke" }).click();
  await visitor.reload();
  await expect(visitor.getByRole("heading", { name: "This share link is unavailable" })).toBeVisible();
  await visitor.close();
});
