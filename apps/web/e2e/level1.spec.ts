import { expect, test } from "@playwright/test";
import { signUpAndVerifyIfConfigured } from "./helpers/auth";

test("sign up, create notebook, use workspace, change theme, sign out", async ({ page }) => {
  const authIp = `198.18.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  await page.route("**/api/auth/**", (route) => route.continue({
    headers: { ...route.request().headers(), "x-forwarded-for": authIp },
  }));
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  const email = `level1-${Date.now()}@example.test`;
  await page.goto("/notebooks");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await signUpAndVerifyIfConfigured(page, { name: "Level One Tester", email, password: "strong-test-password-123" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Notebooks" })).toBeVisible();
  await page.getByLabel("New notebook title").fill("My research");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("link", { name: "My research" })).toBeVisible();
  await page.getByRole("link", { name: "My research" }).click();
  await expect(page.getByRole("heading", { name: "My research" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Studio", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Collapse sources" }).click();
  await page.getByRole("button", { name: "Collapse sources" }).click();
  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByLabel("Assistant persona").fill("Explain clearly");
  await page.getByRole("button", { name: "Save" }).click();
  if (await page.locator("html").evaluate((element) => element.classList.contains("dark"))) {
    await page.getByRole("button", { name: "Toggle theme" }).click();
  }
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.route("**/settings/models?provider=*", async (route) => {
    const provider = new URL(route.request().url()).searchParams.get("provider");
    await route.fulfill({ json: { models: provider === "gemini"
      ? [{ id: "gemini-live", name: "Gemini Live" }]
      : [{ id: "vendor/alpha", name: "Alpha" }, { id: "vendor/beta", name: "Beta" }] } });
  });
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Model settings" })).toBeVisible();
  await page.getByLabel("Search chat model").fill("Alpha");
  await expect(page.getByLabel("Chat model", { exact: true }).getByRole("option", { name: /Alpha/ })).toBeAttached();
  await expect(page.getByLabel("Chat model", { exact: true }).getByRole("option", { name: /Beta/ })).toHaveCount(0);
  await page.getByLabel("LLM provider").selectOption("gemini");
  await page.getByLabel("Chat model", { exact: true }).selectOption("gemini-live");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.reload();
  await expect(page.getByLabel("LLM provider")).toHaveValue("gemini");
  await page.getByRole("link", { name: "OpenNotebook Studio" }).click();
  await page.getByRole("link", { name: "My research" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileTabs = page.getByRole("tablist", { name: "Workspace panels" });
  await expect(mobileTabs.getByRole("tab", { name: "Sources" })).toBeVisible();
  await mobileTabs.getByRole("tab", { name: "Studio" }).click();
  await expect(page.getByRole("heading", { name: "Studio", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("strong-test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/notebooks$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Notebooks" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/notebooks");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  expect(consoleErrors).toEqual([]);
});

test("failed sign-ins are rate limited", async ({ request }) => {
  const statuses: number[] = [];
  const ip = `198.19.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  for (let attempt = 0; attempt < 7; attempt++) {
    const response = await request.post("/api/auth/sign-in/email", {
      data: { email: `missing-${Date.now()}@example.test`, password: "wrong-password" },
      headers: { "x-forwarded-for": ip },
    });
    statuses.push(response.status());
  }
  expect(statuses).toContain(429);
});
