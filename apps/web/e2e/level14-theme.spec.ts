import { expect, test } from "@playwright/test";

test("theme tokens follow the app's manual theme attribute", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  const backgrounds = await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    const light = getComputedStyle(document.documentElement).getPropertyValue("--bg-canvas").trim();
    document.documentElement.dataset.theme = "dark";
    const dark = getComputedStyle(document.documentElement).getPropertyValue("--bg-canvas").trim();
    return { light, dark };
  });

  expect(backgrounds.dark).not.toBe(backgrounds.light);
});
