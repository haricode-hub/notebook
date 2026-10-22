import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/design/current");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await page.emulateMedia({ reducedMotion: "reduce" });
const email = `level15-capture-${Date.now()}@example.test`;
const password = "strong-test-password-123";
const authIp = `198.18.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
const captured = { sources: null, content: null };
const browserErrors = [];
page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
page.on("pageerror", (error) => browserErrors.push(error.message));

try {
  await page.route("**/api/auth/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }));
  page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("/chat")) console.log(`Chat request path: ${new URL(request.url()).pathname}`); });
  page.on("response", (response) => { if (response.url().includes("/chat")) console.log(`Chat response: ${response.status()}`); });
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (!pathname.startsWith("/notebooks/")) return;
    if (!response.ok()) return;
    if (/\/sources$/.test(pathname)) void response.json().then((data) => { if (Array.isArray(data)) captured.sources = data; }).catch(() => {});
    if (/\/sources\/[^/]+\/content$/.test(pathname)) void response.json().then((data) => { captured.content = data; }).catch(() => {});
  });
  await page.goto(`${baseURL}/sign-up`);
  await page.getByLabel("Name").fill("Researcher");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect.poll(async () => new URL(page.url()).pathname === "/notebooks" ? "ready" : (await page.getByRole("status").allTextContents()).join(" "), { timeout: 15_000 }).toMatch(/ready|verify|check/i);
  if (new URL(page.url()).pathname !== "/notebooks") {
    let id = "";
    await expect.poll(async () => {
      const result = await (await page.request.get("http://localhost:8025/api/v1/messages")).json().catch(() => ({ messages: [] }));
      id = result.messages?.find((message) => /verify/i.test(message.Subject ?? "")
        && message.To?.some((recipient) => recipient.Address?.toLowerCase() === email.toLowerCase()))?.ID ?? "";
      return id;
    }, { timeout: 15_000 }).not.toBe("");
    const message = await (await page.request.get(`http://localhost:8025/api/v1/message/${id}`)).json();
    const link = `${message.Text ?? ""}\n${message.HTML ?? ""}`.match(/https?:\/\/[^\s<>"']+/)?.[0];
    if (!link) throw new Error("Mailpit verification URL was not found");
    await page.goto(link.replaceAll("&amp;", "&").replace(/[),.]$/, ""));
    await page.goto(`${baseURL}/notebooks`);
    if (new URL(page.url()).pathname !== "/notebooks") {
      await page.goto(`${baseURL}/sign-in`);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/notebooks$/);
    }
  }

  await page.getByLabel("New notebook title").fill("Research notebook");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Research notebook" }).click();
  const notebookId = new URL(page.url()).pathname.split("/").at(-1);
  if (!notebookId) throw new Error("Could not read notebook id from workspace URL");
  await page.getByRole("button", { name: "Commands" }).click();
  await expect(page.getByRole("dialog", { name: "Go to" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Go to" })).toHaveCount(0);
  await page.waitForTimeout(100);
  await page.keyboard.press("Control+KeyK");
  await expect(page.getByRole("dialog", { name: "Go to" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Go to" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add source" }).first().click();
  await page.getByLabel(/PDF, DOCX/).setInputFiles({ name: "research-notes.txt", mimeType: "text/plain", buffer: Buffer.from("A research note helps students connect evidence with a clear claim. Each section should explain the finding and show where it appears in the source. Reviewing the evidence improves recall.") });
  await page.getByRole("dialog", { name: "Add sources" }).getByRole("button", { name: "Add source", exact: true }).click();
  const sourceRow = page.locator("li").filter({ hasText: "research-notes.txt" }).first();
  await expect(sourceRow.getByText(/^ready$/i)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Source added", { exact: true })).toBeHidden({ timeout: 10_000 });
  await expect.poll(() => captured.sources?.length ?? 0).toBeGreaterThan(0);
  await sourceRow.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Source text" })).toBeVisible();
  await expect.poll(() => captured.content?.chunks?.length ?? 0).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Close viewer" }).click();

  const viewports = [{ label: "375", width: 375, height: 812 }, { label: "768", width: 768, height: 1024 }, { label: "1280", width: 1280, height: 900 }, { label: "1680", width: 1680, height: 1050 }];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => { localStorage.setItem("theme", value); document.documentElement.setAttribute("data-theme", value); }, theme);
      if (viewport.width < 768) await page.getByRole("tablist", { name: "Workspace panels" }).getByRole("tab", { name: "Chat" }).click();
      await page.screenshot({ path: path.join(output, `workspace-${viewport.label}-${theme}.png`), fullPage: true });
    }
  }

  await page.route("**/notebooks/*/chat", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    console.log(`Serving FAKE visual chat response for ${new URL(route.request().url()).pathname}`);
    const source = captured.sources?.find((item) => item.name === "research-notes.txt");
    const content = captured.content;
    if (!source || !content?.chunks?.length) throw new Error("Source fixtures were not captured from the signed-in application session");
    const chunk = content.chunks[0];
    const quote = chunk.text.slice(0, 110);
    const answer = `The note says that students connect evidence with a clear claim [S1].`;
    const citation = { n: 1, chunk_id: chunk.id, source_id: source.id, source_name: source.name, quote, page_start: chunk.page_start, char_start: chunk.char_start, char_end: chunk.char_end };
    const final = { message_id: "level15-visual-fake", content: answer, citations: [citation], followups: [], model_name: "FAKE screenshot fixture" };
    await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "access-control-allow-origin": baseURL, "access-control-allow-credentials": "true", vary: "Origin" }, body: `event: token\ndata: ${JSON.stringify({ text: answer })}\n\nevent: final\ndata: ${JSON.stringify(final)}\n\n` });
  });
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => { localStorage.setItem("theme", value); document.documentElement.setAttribute("data-theme", value); }, theme);
      if (viewport.width < 768) await page.getByRole("tablist", { name: "Workspace panels" }).getByRole("tab", { name: "Chat" }).click();
      const clearChat = page.getByRole("button", { name: "Clear chat" });
      if (await clearChat.isEnabled()) {
        await Promise.all([page.waitForResponse((response) => response.request().method() === "DELETE" && response.url().includes("/chat")), clearChat.click()]);
        await expect(page.getByText("Start with the evidence.", { exact: true })).toBeVisible();
        await page.waitForTimeout(5_000);
      }
      await page.getByLabel("Ask your sources").fill("What does the note say?");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByRole("button", { name: "Source 1: research-notes.txt" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
      const citation = page.getByRole("button", { name: "Source 1: research-notes.txt" });
      await citation.scrollIntoViewIfNeeded();
      await citation.click();
      await expect(page.getByRole("dialog", { name: "Source viewer" })).toBeVisible();
      await expect(page.getByRole("tabpanel", { name: "Source text" }).locator("mark[data-citation-highlight]")).toContainText("A research note helps students connect evidence");
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(output, `source-viewer-${viewport.label}-${theme}.png`), fullPage: true });
      await page.getByRole("button", { name: "Close viewer" }).click();
      await page.screenshot({ path: path.join(output, `chat-citations-${viewport.label}-${theme}.png`), fullPage: true });
      if (viewport.width < 768) await page.getByRole("tablist", { name: "Workspace panels" }).getByRole("tab", { name: "Studio" }).click();
      if (viewport.width >= 768 && viewport.width < 1200) await page.getByRole("tablist", { name: "Workspace side panel" }).getByRole("tab", { name: "Studio" }).click();
      await page.screenshot({ path: path.join(output, `studio-${viewport.label}-${theme}.png`), fullPage: true });
      const settingsPage = await context.newPage();
      await settingsPage.emulateMedia({ reducedMotion: "reduce" });
      await settingsPage.setViewportSize({ width: viewport.width, height: viewport.height });
      settingsPage.on("requestfailed", (request) => { if (request.url().includes("/settings")) console.error(`Settings request failed: ${request.url()} ${request.failure()?.errorText}`); });
      settingsPage.on("response", (response) => { if (new URL(response.url()).pathname === "/settings") console.log(`Settings API response: ${response.status()}`); });
      await settingsPage.goto(`${baseURL}/settings`);
      await expect(settingsPage.getByRole("heading", { name: "Settings" })).toBeVisible();
      await expect(settingsPage.getByLabel("LLM provider")).toBeVisible({ timeout: 20_000 });
      await settingsPage.screenshot({ path: path.join(output, `settings-${viewport.label}-${theme}.png`), fullPage: true });
      await settingsPage.getByRole("combobox", { name: "LLM provider" }).click();
      await expect(settingsPage.getByRole("option", { name: "Gemini", exact: true })).toBeVisible();
      await settingsPage.keyboard.press("Escape");
      await settingsPage.close();
    }
  }
  await page.getByLabel("Choose sources for chat").click();
  await expect(page.getByText("Sources used in chat")).toBeVisible();
  await expect(page.locator("details").filter({ hasText: "Sources used in chat" }).getByText("research-notes.txt", { exact: true })).toBeVisible();
  await page.getByLabel("Choose sources for chat").click();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  const preferences = page.getByRole("dialog", { name: "Notebook preferences" });
  await expect(preferences.getByLabel("Assistant persona")).toBeVisible();
  await preferences.getByRole("combobox", { name: "Response length" }).click();
  await expect(page.getByRole("option", { name: "Long", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await preferences.getByRole("button", { name: "Cancel" }).click();
  const designPage = await context.newPage();
  await designPage.emulateMedia({ reducedMotion: "reduce" });
  await designPage.goto(`${baseURL}/design-preview`);
  await designPage.getByRole("button", { name: "Open dialog" }).first().click();
  await expect(designPage.getByRole("dialog", { name: "Dialog primitive" })).toBeVisible();
  await designPage.keyboard.press("Escape");
  await expect(designPage.getByRole("dialog", { name: "Dialog primitive" })).toHaveCount(0);
  for (const viewport of viewports) {
    await designPage.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const theme of ["light", "dark"]) {
      await designPage.evaluate((value) => { document.documentElement.setAttribute("data-theme", value); }, theme);
      await designPage.screenshot({ path: path.join(output, `primitives-${viewport.label}-${theme}.png`), fullPage: true });
    }
  }
  await designPage.close();
  if (browserErrors.length) throw new Error(`Browser console errors during capture: ${browserErrors.join(" | ")}`);
  console.log(`Captured 48 screen and primitive screenshots into ${output}. Chat content is a FAKE screenshot fixture.`);
} finally {
  await browser.close();
}
