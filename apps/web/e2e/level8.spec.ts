import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("generate an audio overview, seek its transcript, and download the MP3", async ({ page }) => {
  test.setTimeout(300_000);
  const authIp = `198.18.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": authIp } }));
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Level Eight Tester");
  await page.getByLabel("Email").fill(`level8-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("strong-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/notebooks$/);
  await page.getByLabel("New notebook title").fill("Audio overview test");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Audio overview test" }).click();
  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByLabel("PDF, DOCX, PPTX, TXT or MD").setInputFiles({
    name: "audio-evidence.txt", mimeType: "text/plain",
    buffer: Buffer.from("Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs light. Water and carbon dioxide are converted into glucose and oxygen inside chloroplasts."),
  });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const source = page.getByRole("region", { name: "Sources" }).filter({ visible: true }).getByRole("listitem").filter({ hasText: "audio-evidence.txt" });
  await expect(source.getByText(/^ready$/i)).toBeVisible({ timeout: 60_000 });
  const studio = page.getByRole("region", { name: "Studio" }).filter({ visible: true });
  await studio.getByRole("button", { name: "Audio overview", exact: true }).click();
  const options = page.getByRole("dialog", { name: "Generate artifact" });
  await options.getByLabel("Length").selectOption("short");
  await options.getByLabel("Audio tone").selectOption("curious");
  await options.getByRole("button", { name: "Generate", exact: true }).click();
  const row = studio.getByRole("region", { name: "Studio artifacts" }).getByRole("listitem").first();
  await expect(row.getByText("ready", { exact: true })).toBeVisible({ timeout: 240_000 });
  await row.getByRole("button").first().click();
  const viewer = page.getByRole("dialog", { name: "Artifact viewer" });
  const player = viewer.getByRole("region", { name: "Audio overview player" });
  await expect(player.getByRole("region", { name: "Synced transcript" })).toContainText("Maya");
  const seek = player.getByRole("button", { name: /Seek to Alex at/ }).first();
  await seek.click();
  const currentTime = await player.locator("audio").evaluate((audio) => (audio as HTMLAudioElement).currentTime);
  expect(currentTime).toBeGreaterThan(0);
  await player.getByLabel("Playback speed").selectOption("1.5");
  await expect(player.locator("audio")).toHaveJSProperty("playbackRate", 1.5);
  const downloadPromise = page.waitForEvent("download");
  await player.getByRole("button", { name: "Download MP3" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mp3$/);
  expect(readFileSync(await download.path()).subarray(0, 3).toString()).toBe("ID3");
  await player.getByRole("button", { name: "[S1]" }).first().click();
  const sourceViewer = page.getByRole("dialog", { name: "Source viewer" });
  await expect(sourceViewer).toBeVisible();
  await expect.poll(async () => sourceViewer.locator("audio").evaluate((audio) => (audio as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
});
