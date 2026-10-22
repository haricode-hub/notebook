import { expect, test } from "@playwright/test";
import { signUpAndVerifyIfConfigured } from "./helpers/auth";

test("upload a PDF and watch it become ready", async ({ page }) => {
  const authIp = `198.18.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }));
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/sign-up");
  await signUpAndVerifyIfConfigured(page, { name: "Level Two Tester", email: `level2-${Date.now()}@example.test`, password: "strong-test-password-123" });
  await page.getByLabel("New notebook title").fill("PDF research");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "PDF research" }).click();
  const pdfPage = await page.context().newPage();
  await pdfPage.setContent("<h1>Research notes</h1><p>Grounded answers cite their original sources.</p>");
  const pdf = await pdfPage.pdf();
  await pdfPage.close();
  await page.getByRole("button", { name: "Add source" }).first().click();
  await page.getByLabel(/PDF, DOCX/).setInputFiles({ name: "research.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("dialog", { name: "Add sources" }).getByRole("button", { name: "Add source", exact: true }).click();
  const card = page.locator("li:visible").filter({ hasText: "research.pdf" });
  await expect(card).toBeVisible();
  await expect(card.getByText(/^ready$/i)).toBeVisible({ timeout: 60_000 });
  await card.getByRole("button", { name: "Delete research.pdf" }).click();
  await expect(card).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("source events reconnect after a drop and an expired token response", async ({ page }) => {
  const authIp = `198.18.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }));
  await page.goto("/sign-up");
  await signUpAndVerifyIfConfigured(page, { name: "Reconnect Tester", email: `level2-reconnect-${Date.now()}@example.test`, password: "strong-test-password-123" });
  await page.getByLabel("New notebook title").fill("Live sources");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  let connections = 0;
  let tokenRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/api/auth/token")) tokenRequests++; });
  await page.route("**/notebooks/*/events", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    connections++;
    if (connections === 1) return route.abort();
    if (connections === 2) return route.fulfill({ status: 401, json: { message: "Token expired" } });
    return route.continue();
  });
  await page.getByRole("link", { name: "Live sources" }).click();
  await expect(page.getByRole("heading", { name: "Sources", exact: true })).toBeVisible();
  await expect.poll(() => connections, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  await expect.poll(() => tokenRequests, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
});
