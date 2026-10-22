import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

type AxeViolation = { id: string; impact: string | null; nodes: unknown[] };

async function expectWcagAxePass(page: import("@playwright/test").Page) {
  await page.addScriptTag({ path: path.resolve(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const results = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (root: Document, options: object) => Promise<{ violations: AxeViolation[] }> } }).axe;
    return axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
  });
  expect(results.violations, JSON.stringify(results.violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length }))).slice(0, 2000)).toEqual([]);
}

test("forgot password validates email and gives an account-neutral result", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Enter a valid email address", { exact: true })).toBeVisible();
  await page.getByLabel("Email").fill("reader@example.test");
  await page.route("**/api/auth/request-password-reset", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: true }) });
  });
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account can receive email");
  await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
});

test("sign-up and sign-in show validation errors accessibly", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#password")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#confirmPassword")).toHaveAttribute("aria-invalid", "true");
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("bad-email");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter a valid email address", { exact: true })).toBeVisible();
});

test("email verification, sign-in, and password reset work through Mailpit", async ({ page, request }) => {
  const email = `auth-flow-${Date.now()}@example.test`;
  const readLatestMailLink = async (recipient: string, kind: "verify" | "reset") => {
    let messageId = "";
    await expect.poll(async () => {
      const listing = await request.get("http://localhost:8025/api/v1/messages");
      const data = await listing.json() as { messages: Array<{ ID: string; Subject: string; To?: Array<{ Address: string }> }> };
      const subject = kind === "verify" ? /verify/i : /reset|password/i;
      messageId = data.messages.find((message) => subject.test(message.Subject)
        && message.To?.some((to) => to.Address.toLowerCase() === recipient.toLowerCase()))?.ID ?? "";
      return messageId;
    }, { timeout: 10_000 }).not.toBe("");
    const response = await request.get(`http://localhost:8025/api/v1/message/${messageId}`);
    const message = await response.json() as { Text?: string; HTML?: string };
    const body = `${message.Text ?? ""}\n${message.HTML ?? ""}`;
    const rawLink = body.match(/https?:\/\/[^\s<>"']+/)?.[0];
    expect(rawLink).toBeTruthy();
    return rawLink!.replaceAll("&amp;", "&").replace(/[),.]$/, "");
  };
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Auth Flow Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("initial-test-password-123");
  await page.getByLabel("Confirm password").fill("initial-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  const verificationLink = await readLatestMailLink(email, "verify");
  await page.goto(verificationLink);
  await page.goto("/notebooks");
  await expect(page).toHaveURL(/\/notebooks/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("initial-test-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/notebooks$/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("New notebook title").fill("Level 14 panel test");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("link", { name: "Level 14 panel test" }).click();
  await expect(page.getByRole("heading", { name: "Level 14 panel test" })).toBeVisible();
  const sourceDivider = page.getByRole("separator", { name: "Resize sources and chat panels" });
  const dividerBefore = await sourceDivider.boundingBox();
  expect(dividerBefore).toBeTruthy();
  await page.mouse.move(dividerBefore!.x + dividerBefore!.width / 2, dividerBefore!.y + 100);
  await page.mouse.down();
  await page.mouse.move(dividerBefore!.x + 150, dividerBefore!.y + 100, { steps: 2 });
  await page.mouse.up();
  const workspaceId = new URL(page.url()).pathname.split("/").at(-1);
  const savedLayout = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), `open-notebook:workspace-layout:${workspaceId}`) as Record<string, number> | null;
  expect(savedLayout).toBeTruthy();
  expect(savedLayout!.sources + savedLayout!.chat + savedLayout!.studio).toBeCloseTo(100);
  const dividerAfter = await sourceDivider.boundingBox();
  expect(dividerAfter!.x).toBeGreaterThan(dividerBefore!.x + 30);
  const savedDividerX = dividerAfter!.x;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Level 14 panel test" })).toBeVisible();
  await expect.poll(async () => (await sourceDivider.boundingBox())?.x ?? 0).toBeCloseTo(savedDividerX, 0);
  await expectWcagAxePass(page);

  const workspaceScreenshots = path.resolve(process.cwd(), "../../docs/levels/level14/screenshots/after-pass8");
  await mkdir(workspaceScreenshots, { recursive: true });
  if (await page.locator("html").evaluate((element) => element.classList.contains("dark"))) {
    await page.getByRole("button", { name: "Toggle theme" }).click();
  }
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.screenshot({ path: path.join(workspaceScreenshots, "workspace-1440-light.png"), fullPage: true });
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await page.locator("header").evaluate((header) => getComputedStyle(header).backgroundColor)).not.toBe("rgb(255, 255, 255)");
  await page.screenshot({ path: path.join(workspaceScreenshots, "workspace-1440-dark.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.getByRole("tablist", { name: "Workspace panels" }).getByRole("tab", { name: "Sources" })).toBeVisible();
  await expectWcagAxePass(page);
  await page.screenshot({ path: path.join(workspaceScreenshots, "workspace-390-light.png"), fullPage: true });
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await page.locator("header").evaluate((header) => getComputedStyle(header).backgroundColor)).not.toBe("rgb(255, 255, 255)");
  await page.screenshot({ path: path.join(workspaceScreenshots, "workspace-390-dark.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account can receive email");
  const resetLink = await readLatestMailLink(email, "reset");
  await page.goto(resetLink);
  await page.getByLabel("New password", { exact: true }).fill("updated-test-password-456");
  await page.getByLabel("Confirm new password").fill("updated-test-password-456");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/sign-in\?password-reset=1$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("updated-test-password-456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/notebooks$/);
  await page.getByRole("button", { name: "Sign out" }).click();
});
