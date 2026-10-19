import { expect, test } from "@playwright/test";

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
  const readLatestMailLink = async (previousCount: number) => {
    let messageId = "";
    await expect.poll(async () => {
      const listing = await request.get("http://localhost:8025/api/v1/messages");
      const data = await listing.json() as { messages: Array<{ ID: string }> };
      if (data.messages.length > previousCount) messageId = data.messages[0]?.ID ?? "";
      return messageId;
    }, { timeout: 10_000 }).not.toBe("");
    const response = await request.get(`http://localhost:8025/api/v1/message/${messageId}`);
    const message = await response.json() as { Text?: string; HTML?: string };
    const body = `${message.Text ?? ""}\n${message.HTML ?? ""}`;
    const rawLink = body.match(/https?:\/\/[^\s<>"']+/)?.[0];
    expect(rawLink).toBeTruthy();
    return rawLink!.replaceAll("&amp;", "&").replace(/[),.]$/, "");
  };
  const mailCount = async () => {
    const response = await request.get("http://localhost:8025/api/v1/messages");
    const data = await response.json() as { messages: unknown[] };
    return data.messages.length;
  };

  const beforeVerification = await mailCount();
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Auth Flow Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("initial-test-password-123");
  await page.getByLabel("Confirm password").fill("initial-test-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  const verificationLink = await readLatestMailLink(beforeVerification);
  await page.goto(verificationLink);
  await page.goto("/notebooks");
  await expect(page).toHaveURL(/\/notebooks/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("initial-test-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/notebooks$/);
  await page.getByRole("button", { name: "Sign out" }).click();

  const beforeReset = await mailCount();
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account can receive email");
  const resetLink = await readLatestMailLink(beforeReset);
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
