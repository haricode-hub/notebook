import { expect, test } from "@playwright/test";

test("Tailwind dark utilities follow the app's manual theme class", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  const backgrounds = await page.evaluate(() => {
    const surface = document.createElement("div");
    surface.className = "bg-white dark:bg-slate-950";
    document.body.append(surface);
    document.documentElement.classList.remove("dark");
    const light = getComputedStyle(surface).backgroundColor;
    document.documentElement.classList.add("dark");
    const dark = getComputedStyle(surface).backgroundColor;
    return { light, dark };
  });

  expect(backgrounds.dark).not.toBe(backgrounds.light);
});
