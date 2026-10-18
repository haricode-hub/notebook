import { expect, test } from "@playwright/test";

test("citation opens and highlights the original PDF and extracted text", async ({ page }) => {
  test.setTimeout(180_000);
  const authIp = `198.19.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }));
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.setContent("<html><body><p style='font-size:18px'>The launch code is BLUEBIRD-42.</p></body></html>");
  const pdf = await page.pdf({ format: "A4" });

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Level Four Tester");
  await page.getByLabel("Email").fill(`level4-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("strong-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/notebooks$/);
  await page.getByLabel("New notebook title").fill("PDF citations");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "PDF citations" }).click();
  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByLabel("PDF, DOCX, PPTX, TXT or MD").setInputFiles({ name: "launch.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const card = page.locator("li:visible").filter({ hasText: "launch.pdf" });
  await expect(card.getByText(/^ready$/i)).toBeVisible({ timeout: 90_000 });

  await page.getByLabel("Ask your sources").fill("What is the launch code?");
  await page.getByRole("button", { name: "Send" }).click();
  const chip = page.getByRole("button", { name: "Source 1: launch.pdf" });
  await expect(chip).toBeVisible();
  await chip.click();
  const viewer = page.getByRole("dialog", { name: "Source viewer" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("tabpanel", { name: "Original PDF" })).toBeVisible();
  const pdfHighlight = viewer.locator(".react-pdf__Page__textContent mark[data-citation-highlight]").first();
  await expect(pdfHighlight).toContainText("BLUEBIRD-42", { timeout: 20_000 });
  await expect(pdfHighlight).toBeInViewport();
  await viewer.getByRole("tab", { name: "Text" }).click();
  const textHighlight = viewer.locator("mark[data-citation-highlight]").first();
  await expect(textHighlight).toContainText("BLUEBIRD-42");
  await expect(textHighlight).toBeInViewport();
  await viewer.getByText("Details", { exact: true }).click();
  await expect(viewer.getByText("Type: PDF")).toBeVisible();
  await viewer.getByRole("button", { name: "Rename source" }).click();
  await viewer.getByLabel("Source name").fill("Research launch.pdf");
  await viewer.getByRole("button", { name: "Save" }).click();
  await expect(viewer.getByRole("heading", { name: "Research launch.pdf" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  const cachedStart = await page.evaluate(() => performance.now());
  await chip.click();
  await expect(viewer).toBeVisible();
  const cachedOpenMs = await page.evaluate((start) => performance.now() - start, cachedStart);
  expect(cachedOpenMs).toBeLessThan(500);
  await page.keyboard.press("Escape");

  await page.route("**/notebooks/*/chat", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const messages = await response.json() as Array<{ role: string; content: string; citations: Array<Record<string, unknown>> }>;
    const answer = messages.find((message) => message.role === "assistant" && message.citations.length > 0);
    if (!answer) throw new Error("Expected a persisted cited answer");
    answer.content = "The launch evidence appears twice [S1] and [S2]. A mismatched PDF excerpt [S3].";
    answer.citations = [
      { ...answer.citations[0], n: 1 },
      { ...answer.citations[0], n: 2 },
      { ...answer.citations[0], n: 3, chunk_id: "missing-pdf-text", quote: "words absent from this PDF" },
    ];
    await route.fulfill({ response, json: messages });
  });
  await page.reload();
  await page.getByRole("button", { name: "Source 1: launch.pdf" }).click();
  await expect(viewer.getByText("Citation S1", { exact: false })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("Citation S2", { exact: false })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(viewer.getByText("Citation S1", { exact: false })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("Citation S3", { exact: false })).toBeVisible();
  await expect(viewer.getByRole("note")).toContainText("could not be located");
  await viewer.getByRole("button", { name: "Show highlighted extracted text" }).click();
  await expect(viewer.locator("mark[data-citation-highlight]").first()).toContainText("BLUEBIRD-42");
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);

  const documentPage = await page.context().newPage();
  await documentPage.setContent(`<html><body>${Array.from({ length: 300 }, (_, index) => `<section style="${index === 299 ? "" : "break-after:page"}">Page ${index + 1}</section>`).join("")}</body></html>`);
  const largePdf = await documentPage.pdf({ format: "A4" });
  await documentPage.close();
  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByLabel("PDF, DOCX, PPTX, TXT or MD").setInputFiles({ name: "large.pdf", mimeType: "application/pdf", buffer: largePdf });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.locator("li:visible").filter({ hasText: "large.pdf" }).getByRole("button", { name: "Open" }).click();
  const largeViewer = page.getByRole("dialog", { name: "Source viewer" });
  await expect(largeViewer.getByLabel("PDF page count")).toContainText("300", { timeout: 30_000 });
  expect(await largeViewer.locator("[data-pdf-page]").count()).toBeLessThan(10);
  const pages = largeViewer.getByLabel("PDF pages");
  await expect.poll(async () => pages.evaluate((element) => element.scrollHeight)).toBeGreaterThan(100_000);
  await pages.evaluate((element) => { element.scrollTop = element.scrollHeight / 2; });
  await expect.poll(async () => (await largeViewer.locator("[data-pdf-page]").evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-pdf-page"))))).some((number) => number > 10 && number < 290)).toBe(true);
  await largeViewer.getByLabel("Jump to PDF page").fill("300");
  await largeViewer.getByLabel("Jump to PDF page").press("Enter");
  await expect(largeViewer.locator("[data-pdf-page='300']")).toBeVisible({ timeout: 15_000 });
  expect(await largeViewer.locator("[data-pdf-page]").count()).toBeLessThan(10);
  await page.keyboard.press("Escape");
  expect(consoleErrors).toEqual([]);
});
