import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signUpAndVerifyIfConfigured } from "./helpers/auth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

test("generate a study guide, export it, and open its source citation", async ({ page }) => {
  test.setTimeout(120_000);
  const authIp = `198.18.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }));
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  await page.goto("/sign-up");
  await signUpAndVerifyIfConfigured(page, { name: "Level Six Tester", email: `level6-${Date.now()}@example.test`, password: "strong-test-password-123" });
  await page.getByLabel("New notebook title").fill("Studio artifacts");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Studio artifacts" }).click();

  await page.getByRole("button", { name: "Add source" }).first().click();
  await page.getByLabel(/PDF, DOCX/).setInputFiles({
    name: "launch.txt", mimeType: "text/plain",
    buffer: Buffer.from("The launch code is BLUEBIRD-42. It identifies the research mission. The launch takes place on Tuesday."),
  });
  await page.getByRole("dialog", { name: "Add sources" }).getByRole("button", { name: "Add source", exact: true }).click();
  const sources = page.getByRole("region", { name: "Sources" }).filter({ visible: true });
  const card = sources.locator("li").filter({ hasText: "launch.txt" });
  await expect(card.getByText(/^ready$/i)).toBeVisible({ timeout: 60_000 });

  const studio = page.getByRole("region", { name: "Studio" }).filter({ visible: true });
  await studio.getByRole("button", { name: "Study guide" }).click();
  const options = page.getByRole("dialog", { name: /Generate Study guide/ });
  await expect(options.getByLabel("launch.txt")).toBeChecked();
  await options.getByLabel("Focus (optional)").fill("launch code");
  await options.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(options).toHaveCount(0, { timeout: 15_000 });
  const artifact = studio.getByRole("region", { name: "Studio artifacts" }).getByRole("list").last().getByRole("listitem").first();
  await expect(artifact.getByText("ready", { exact: true })).toBeVisible({ timeout: 30_000 });
  await artifact.getByRole("button").first().click();
  const viewer = page.getByRole("region", { name: "Artifact viewer" });
  await expect(viewer).toContainText("BLUEBIRD-42");
  await expect.poll(() => viewer.locator(".artifact-toolbar").evaluate((element) => getComputedStyle(element).borderBottomWidth)).toBe("0px");
  await expect(page.getByRole("dialog", { name: "Artifact viewer" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Source 1: launch.txt" }).first()).toBeVisible();

  const markdownDownload = page.waitForEvent("download");
  await viewer.getByRole("button", { name: "Markdown" }).click();
  const markdown = await markdownDownload;
  expect(readFileSync(await markdown.path(), "utf8")).toContain("BLUEBIRD-42");
  const docxDownload = page.waitForEvent("download");
  await viewer.getByRole("button", { name: "DOCX" }).click();
  const docx = await docxDownload;
  expect(readFileSync(await docx.path()).subarray(0, 2).toString()).toBe("PK");
  const serverPdfDownload = page.waitForEvent("download");
  await viewer.getByRole("button", { name: "Server PDF" }).click();
  const serverPdf = await serverPdfDownload;
  expect(readFileSync(await serverPdf.path()).subarray(0, 4).toString()).toBe("%PDF");

  const pdf = await page.pdf({ printBackground: true });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(pdf.length).toBeGreaterThan(1000);
  const pdfDocument = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
  const pdfPage = await pdfDocument.getPage(1);
  const pdfText = await pdfPage.getTextContent();
  expect(pdfText.items.filter((item) => "str" in item).map((item) => "str" in item ? item.str : "").join(" ")).toContain("BLUEBIRD-42");

  await viewer.getByRole("button", { name: "Source 1: launch.txt" }).first().click();
  const sourceViewer = page.getByRole("dialog", { name: "Source viewer" });
  await expect(sourceViewer).toBeVisible();
  await expect(sourceViewer.getByRole("tabpanel", { name: "Source text" }).locator("mark[data-citation-highlight]")).toContainText("BLUEBIRD-42");

  // A generated FAQ must render content, and Back to chat must restore the
  // conversation after opening the artifact from the Studio list.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Chat" })).toBeVisible();
  await studio.getByRole("button", { name: "FAQ" }).click();
  const faqOptions = page.getByRole("dialog", { name: /Generate FAQ/ });
  await faqOptions.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(faqOptions).toHaveCount(0, { timeout: 15_000 });
  const pendingResult = page.getByRole("region", { name: "Studio result" });
  await expect.poll(() => pendingResult.locator(".border-b-0").first().evaluate((element) => getComputedStyle(element).borderBottomWidth)).toBe("0px");
  const faqRow = studio.getByRole("region", { name: "Studio artifacts" }).getByRole("list").last().getByRole("listitem").filter({ hasText: "FAQ" }).last();
  await expect(faqRow.getByText("ready", { exact: true })).toBeVisible({ timeout: 90_000 });
  await faqRow.getByRole("button").first().click();
  const faqViewer = page.getByRole("region", { name: "Artifact viewer" });
  await expect(faqViewer.getByRole("heading", { level: 1 })).not.toBeEmpty();
  await expect(faqViewer.locator(".markdown-body").first()).not.toBeEmpty();
  await faqViewer.getByRole("button", { name: "Back to chat" }).click();
  await expect(page.getByRole("region", { name: "Chat" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
