import { expect, test } from "@playwright/test";

test("shows the current landing page and healthy API and embed", async ({ page, request }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Your sources. Your questions. The evidence between them." })).toBeVisible();
  const api = await request.get("http://127.0.0.1:8000/readyz");
  expect(api.ok()).toBe(true);
  expect(await api.json()).toMatchObject({ status: "ok", db: "ok", redis: "ok", embed: "ok" });
  const embed = await request.get("http://127.0.0.1:8001/readyz");
  expect(embed.ok()).toBe(true);
  expect(await embed.json()).toMatchObject({ status: "ok" });
  await page.screenshot({ path: testInfo.outputPath("readiness.png"), fullPage: true });
  expect(errors).toEqual([]);
});
