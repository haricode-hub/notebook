import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";

const snapshots = path.resolve(process.cwd(), "../../docs/levels/level14/screenshots");
const stage = process.env.LEVEL14_SCREENSHOT_STAGE ?? "before-pass2";

for (const viewport of [{ name: "1440", width: 1440, height: 1000 }, { name: "390", width: 390, height: 844 }]) {
  for (const theme of ["light", "dark"] as const) {
    test(`Level 14 auth baseline ${viewport.name}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/sign-in");
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
      await page.locator("html").evaluate((html, mode) => html.classList.toggle("dark", mode === "dark"), theme);
      const target = path.join(snapshots, stage, `${viewport.name}-${theme}.png`);
      await mkdir(path.dirname(target), { recursive: true });
      await page.screenshot({ path: target, fullPage: true });
    });
  }
}

test("button feedback responds by the next frame and keeps a visible keyboard target", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/sign-in");
  const button = page.getByRole("button", { name: "Sign in" });
  const box = await button.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await button.evaluate((element) => {
    const el = element as HTMLButtonElement;
    el.addEventListener("pointerdown", () => {
      const start = performance.now();
      requestAnimationFrame(() => {
        const transform = getComputedStyle(el).transform;
        const scale = transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a;
        (window as Window & { __level14Press?: number }).__level14Press = performance.now() - start;
        (window as Window & { __level14Scale?: number }).__level14Scale = scale;
      });
    }, { once: true });
  });
  await button.hover();
  await page.mouse.down();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  const feedback = await page.evaluate(() => ({
    elapsed: (window as Window & { __level14Press?: number }).__level14Press,
    scale: (window as Window & { __level14Scale?: number }).__level14Scale,
  }));
  console.info(`pointerdown response=${feedback.elapsed?.toFixed(2)}ms scale=${feedback.scale?.toFixed(3)}`);
  expect(feedback.elapsed).toBeLessThanOrEqual(17);
  expect(feedback.scale).toBeLessThan(1);
  await page.mouse.up();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.matches(":focus-visible") ?? false);
  expect(focused).toBe(true);
});
