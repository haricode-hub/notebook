import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

type Question = { source: string; expected_fact: string; paragraph: number };

test("twenty evaluation passages resolve in PDF and Text views", async ({ page }) => {
  test.setTimeout(180_000);
  const evalRoot = resolve(process.cwd(), "../../evals");
  const questions = JSON.parse(readFileSync(resolve(evalRoot, "questions.json"), "utf8")) as Question[];
  const documents = Object.fromEntries(["solar", "wetlands", "printing"].map((source) => [source, readFileSync(resolve(evalRoot, `docs/${source}.md`), "utf8").split("\n\n").slice(1)])) as Record<string, string[]>;
  const passages = questions.map((question) => documents[question.source][question.paragraph]);
  passages.push(...documents.solar.slice(0, 5).map((paragraph) => paragraph.slice(0, 40)));
  expect(passages).toHaveLength(20);
  const normalize = (value: string) => value.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

  const pdfPage = await page.context().newPage();
  await pdfPage.setContent(`<html><body>${passages.map((passage, index) => `<section style="${index === 19 ? "" : "break-after:page"}"><p style="font-size:16px">${escapeHtml(passage)}</p></section>`).join("")}</body></html>`);
  const pdf = await pdfPage.pdf({ format: "A4" });
  await pdfPage.close();

  const authIp = `198.19.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }));
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Citation Sampler");
  await page.getByLabel("Email").fill(`citation-sample-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("strong-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/notebooks$/);
  await page.getByLabel("New notebook title").fill("Evaluation citations");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Evaluation citations" }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/]+$/);
  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByLabel("PDF, DOCX, PPTX, TXT or MD").setInputFiles({ name: "eval.pdf", mimeType: "application/pdf", buffer: pdf });
  const upload = page.waitForResponse((response) => response.url().endsWith("/sources/upload") && response.status() === 201);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const sourceId = ((await (await upload).json()) as { id: string }).id;

  const text = passages.join("\n\n");
  let offset = 0;
  const chunks = passages.map((passage, index) => {
    const chunk = { id: `eval-chunk-${index}`, text: passage, page_start: index + 1, page_end: index + 1, char_start: offset, char_end: offset + passage.length };
    offset += passage.length + 2;
    return chunk;
  });
  await page.route("**/notebooks/*/sources/*/content", async (route) => {
    const response = await route.fetch();
    const body = await response.json() as Record<string, unknown>;
    body.text = text;
    body.chunks = chunks;
    body.source = { ...(body.source as Record<string, unknown>), status: "ready", page_count: 20 };
    await route.fulfill({ response, json: body });
  });
  const citations = chunks.map((chunk, index) => ({ n: index + 1, chunk_id: chunk.id, source_id: sourceId, source_name: "eval.pdf", quote: chunk.text, page_start: index + 1, char_start: chunk.char_start, char_end: chunk.char_end }));
  await page.route("**/notebooks/*/chat", (route) => route.request().method() === "GET" ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "eval-answer", role: "assistant", content: citations.map((citation) => `Evidence [S${citation.n}].`).join("\n\n"), citations, model_name: "fixture", created_at: new Date().toISOString() }]) }) : route.continue());
  await page.reload();
  await page.getByRole("button", { name: "Source 1: eval.pdf" }).click({ timeout: 15_000 });
  const viewer = page.getByRole("dialog", { name: "Source viewer" });
  await expect(viewer.getByLabel("PDF page count")).toContainText("20");
  let pdfHits = 0;
  for (let index = 0; index < 20; index++) {
    const mark = viewer.locator(`[data-pdf-page='${index + 1}'] .react-pdf__Page__textContent mark[data-citation-highlight]`);
    const state = async () => {
      const highlighted = normalize((await mark.allTextContents()).join(""));
      if (highlighted.includes(normalize(passages[index]))) return "highlight";
      if (await viewer.getByRole("note").count()) return "fallback";
      return "loading";
    };
    await expect.poll(state, { timeout: 10_000 }).not.toBe("loading");
    if (await state() === "highlight") {
      pdfHits++;
    } else {
      await expect(viewer.getByRole("note")).toContainText("could not be located");
    }
    if (index < 19) await page.keyboard.press("ArrowRight");
  }
  expect(pdfHits).toBeGreaterThanOrEqual(18);

  await viewer.getByRole("tab", { name: "Text" }).click();
  let textHits = 0;
  for (let index = 19; index >= 0; index--) {
    const mark = viewer.locator("mark[data-citation-highlight]");
    await expect(mark.first()).toHaveText(passages[index]);
    textHits++;
    if (index > 0) await page.keyboard.press("ArrowLeft");
  }
  expect(textHits).toBeGreaterThanOrEqual(19);
});
