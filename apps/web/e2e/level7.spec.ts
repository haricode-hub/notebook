import { expect, type Locator, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { signUpAndVerifyIfConfigured } from "./helpers/auth";

async function makeNotebookWithSource(page: Page, prefix: string) {
  const authIp = `198.18.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }));
  await page.goto("/sign-up");
  await signUpAndVerifyIfConfigured(page, { name: "Level Seven Tester", email: `level7-${prefix}-${Date.now()}@example.test`, password: "strong-test-password-123" });
  const notebook = `Level7 ${prefix}`;
  await page.getByLabel("New notebook title").fill(notebook);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: notebook }).click();
  await page.getByRole("button", { name: "Add source" }).first().click();
  await page.getByLabel(/PDF, DOCX/).setInputFiles({
    name: `${prefix}.txt`, mimeType: "text/plain",
    buffer: Buffer.from("Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs light. Water and carbon dioxide are converted into glucose and oxygen. The process happens in chloroplasts."),
  });
  await page.getByRole("dialog", { name: "Add sources" }).getByRole("button", { name: "Add source", exact: true }).click();
  const sources = page.getByRole("region", { name: "Sources" }).filter({ visible: true });
  await expect(sources.locator("li").filter({ hasText: `${prefix}.txt` }).getByText(/^ready$/i)).toBeVisible({ timeout: 60_000 });
  return page.getByRole("region", { name: "Studio" }).filter({ visible: true });
}

async function generate(studio: Locator, recipe: string) {
  await studio.getByRole("button", { name: recipe }).click();
  const dialog = studio.page().getByRole("dialog", { name: /Generate/ });
  await dialog.getByRole("button", { name: "Generate", exact: true }).click();
  const row = studio.getByRole("region", { name: "Studio artifacts" }).getByRole("list").last().getByRole("listitem").first();
  await expect(row.getByText("ready", { exact: true })).toBeVisible({ timeout: 120_000 });
  await row.getByRole("button").first().click();
  return studio.page().getByRole("region", { name: "Artifact viewer" });
}

test("mind map renders on mobile, seeds chat, and exports PNG/SVG", async ({ page }) => {
  test.setTimeout(240_000);
  const studio = await makeNotebookWithSource(page, "mindmap");
  const viewer = await generate(studio, "Mind map");
  await expect(viewer.getByRole("region", { name: "Mind map" })).toBeVisible();
  await expect(viewer.getByTestId("mindmap-canvas")).toBeVisible({ timeout: 2_000 });
  const pngDownload = page.waitForEvent("download", { timeout: 15_000 });
  await viewer.getByRole("button", { name: "Export PNG" }).click();
  const png = await pngDownload;
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  expect(readFileSync(await png.path()).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const svgDownload = page.waitForEvent("download", { timeout: 15_000 });
  await viewer.getByRole("button", { name: "Export SVG" }).click();
  const svg = await svgDownload;
  expect(svg.suggestedFilename()).toMatch(/\.svg$/);
  expect(readFileSync(await svg.path(), "utf8")).toContain("<svg");
  await page.setViewportSize({ width: 390, height: 844 });
  await viewer.locator(".react-flow__node").first().click();
  await viewer.getByRole("button", { name: "Ask about this" }).click();
  await expect(page.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Chat" })).toContainText("Explain");
});

test("flashcard known/unknown state persists and Anki CSV exports", async ({ page }) => {
  test.setTimeout(240_000);
  const studio = await makeNotebookWithSource(page, "cards");
  const viewer = await generate(studio, "Flashcards");
  await viewer.getByRole("button", { name: "Flip flashcard" }).click();
  await viewer.getByRole("button", { name: "Known", exact: true }).click();
  const download = page.waitForEvent("download");
  await viewer.getByRole("button", { name: "Export Anki CSV" }).click();
  const csv = await download;
  expect(csv.suggestedFilename()).toBe("flashcards-anki.csv");
  expect(readFileSync(await csv.path(), "utf8")).toContain("Front,Back");
  expect(readFileSync(await csv.path(), "utf8")).toContain("[S1]");
  await page.reload();
  const reopened = page.getByRole("region", { name: "Studio" }).filter({ visible: true });
  await expect(reopened.getByRole("heading", { name: "Generated documents" })).toBeVisible();
  await reopened.getByRole("region", { name: "Studio artifacts" }).getByRole("list").last().getByRole("button", { name: "Flashcards", exact: true }).click();
  await expect(page.getByRole("region", { name: "Artifact viewer" }).getByText(/Leitner box 2/)).toBeVisible();
});

test("quiz saves attempt and opens wrong answer review", async ({ page }) => {
  test.setTimeout(240_000);
  const studio = await makeNotebookWithSource(page, "quiz");
  await generate(studio, "Quiz");
  const notebookId = new URL(page.url()).pathname.split("/").at(-1);
  const listResponsePromise = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname;
    return response.request().method() === "GET" && path.endsWith(`/notebooks/${notebookId}/artifacts`);
  });
  await page.reload();
  const storedArtifacts = await (await listResponsePromise).json() as { recipe: string; status: string; output: { questions?: { question: string; options: string[]; answer_index: number; explanation: string; source_ref: number }[] } | null; citations: { n: number; quote: string }[] }[];
  const generatedQuiz = storedArtifacts.find((item) => item.recipe === "quiz" && item.status === "ready");
  const questions = generatedQuiz?.output?.questions ?? [];
  expect(questions).toHaveLength(10);
  const citationNumbers = new Set(generatedQuiz?.citations.map((citation) => citation.n) ?? []);
  for (const item of questions) {
    expect(item.options).toHaveLength(4);
    expect(new Set(item.options).size).toBe(4);
    expect(item.answer_index).toBeGreaterThanOrEqual(0);
    expect(item.answer_index).toBeLessThan(4);
    expect(citationNumbers.has(item.source_ref)).toBe(true);
    expect(new Set(item.explanation.match(/\[S\d+\]/g))).toEqual(new Set([`[S${item.source_ref}]`]));
  }
  const row = page.getByRole("region", { name: "Studio artifacts" }).getByRole("list").last().getByRole("listitem").first();
  await row.getByRole("button").first().click();
  const viewer = page.getByRole("region", { name: "Artifact viewer" });
  const quiz = viewer.getByRole("region", { name: "Quiz" });
  for (let index = 0; index < 10; index += 1) {
    await quiz.getByRole("radio").nth(index % 4 === 0 ? 1 : 0).check();
    if (index < 9) await quiz.getByRole("button", { name: "Next", exact: true }).click();
  }
  await quiz.getByRole("button", { name: "Finish quiz" }).click();
  await expect(viewer.getByRole("region", { name: "Quiz results" })).toContainText("Score:");
  await viewer.getByRole("button", { name: "Review wrong answers" }).click();
  await expect(viewer.getByRole("region", { name: "Wrong answer review" })).toBeVisible();
  await viewer.getByRole("button", { name: /Open \[S\d+\]/ }).click();
  await expect(page.getByRole("dialog", { name: "Source viewer" })).toBeVisible();
});
