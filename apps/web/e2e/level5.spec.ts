import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("guides, cited notes, conversion, and overview questions work together", async ({ page }) => {
  test.setTimeout(180_000);
  const authIp = `198.18.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }));
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Level Five Tester");
  await page.getByLabel("Email").fill(`level5-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("strong-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/notebooks$/);
  await page.getByLabel("New notebook title").fill("Guide notebook");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Guide notebook" }).click();

  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByLabel("PDF, DOCX, PPTX, TXT or MD").setInputFiles({
    name: "launch.txt", mimeType: "text/plain", buffer: Buffer.from("The launch code is BLUEBIRD-42. The launch takes place on Tuesday.")
  });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const sources = page.getByRole("region", { name: "Sources" }).filter({ visible: true });
  const card = sources.locator("li").filter({ hasText: "launch.txt" });
  await expect(card.getByText(/^ready$/i)).toBeVisible({ timeout: 60_000 });
  await card.getByRole("button", { name: "Guide" }).click();
  const viewer = page.getByRole("dialog", { name: "Source viewer" });
  const guide = viewer.getByRole("tabpanel", { name: "Source guide" });
  await expect(guide.getByRole("heading", { name: "Summary" })).toBeVisible({ timeout: 60_000 });
  await expect(guide).toContainText("BLUEBIRD-42");
  await expect(guide.getByRole("heading", { name: "Key topics" })).toBeVisible();
  await expect(guide.getByRole("button")).toHaveCount(3);
  await guide.getByRole("button").first().click();
  await expect(viewer).toHaveCount(0);

  const chat = page.getByRole("region", { name: "Chat" }).filter({ visible: true });
  await expect(chat.getByRole("button", { name: "Source 1: launch.txt" })).toBeVisible({ timeout: 30_000 });
  await chat.getByRole("button", { name: "Save to note" }).click();
  const studio = page.getByRole("region", { name: "Studio" }).filter({ visible: true });
  const savedNote = studio.locator("ul").last().locator("li").first();
  await expect(savedNote).toBeVisible();
  await savedNote.getByRole("button").click();
  await studio.getByRole("button", { name: "S1: launch.txt" }).click();
  await expect(viewer.getByRole("tabpanel", { name: "Source text" }).locator("mark[data-citation-highlight]")).toContainText("BLUEBIRD-42");
  await viewer.getByRole("button", { name: "Close viewer" }).click();

  await studio.getByRole("button", { name: "New note" }).click();
  await expect(studio.getByLabel("Note title")).toHaveValue("Untitled note");
  await studio.getByLabel("Note title").fill("Study finding");
  const editor = studio.locator(".tiptap[contenteditable='true']");
  await editor.fill("The launch code is BLUEBIRD-42.");
  await studio.getByRole("button", { name: "Save", exact: true }).click();
  await expect(studio.getByRole("button", { name: "Study finding" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await studio.getByRole("button", { name: "Markdown" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Study-finding.md");
  expect(readFileSync(await download.path(), "utf8")).toContain("The launch code is BLUEBIRD-42.");
  await studio.getByRole("button", { name: "Convert to source" }).click();
  const converted = sources.locator("li").filter({ hasText: "Study finding" });
  await expect(converted.getByText(/^ready$/i)).toBeVisible({ timeout: 60_000 });
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/sources/")),
    card.getByRole("checkbox", { name: "Use launch.txt in chat" }).click(),
  ]);
  await expect(card.getByRole("checkbox", { name: "Use launch.txt in chat" })).not.toBeChecked();
  await chat.getByLabel("Ask your sources").fill("What is the launch code?");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByRole("button", { name: "Source 1: Study finding" })).toBeVisible({ timeout: 30_000 });

  const overview = studio.getByRole("region", { name: "Notebook overview" });
  await expect(overview.getByRole("button").first()).toBeVisible({ timeout: 60_000 });
  await overview.getByRole("button").first().click();
  await expect(chat.getByRole("button", { name: /Source 1: Study finding/ }).last()).toBeVisible({ timeout: 30_000 });
  expect(consoleErrors).toEqual([]);
});
