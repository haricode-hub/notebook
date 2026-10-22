import { expect, type Page } from "@playwright/test";

type MailpitMessage = { ID: string; Subject: string; Text?: string; HTML?: string; To?: { Address: string }[] };

async function messages(page: Page): Promise<MailpitMessage[]> {
  const response = await page.request.get("http://localhost:8025/api/v1/messages");
  if (!response.ok()) return [];
  const data = await response.json() as { messages?: MailpitMessage[] };
  return data.messages ?? [];
}

async function verificationLink(page: Page, email: string): Promise<string> {
  let mailId = "";
  await expect.poll(async () => {
    const latest = await messages(page);
    mailId = latest.find((message) => /verify/i.test(message.Subject)
      && message.To?.some((recipient) => recipient.Address.toLowerCase() === email.toLowerCase()))?.ID ?? "";
    return mailId;
  }, { timeout: 10_000 }).not.toBe("");

  const response = await page.request.get(`http://localhost:8025/api/v1/message/${mailId}`);
  const mail = await response.json() as MailpitMessage;
  const rawUrl = `${mail.Text ?? ""}\n${mail.HTML ?? ""}`.match(/https?:\/\/[^\s<>"']+/)?.[0];
  expect(rawUrl, "Mailpit verification email should contain a link").toBeTruthy();
  return rawUrl!.replaceAll("&amp;", "&").replace(/[),.]$/, "");
}

/** Sign up in both local Mailpit mode and CI mode where email delivery is disabled. */
export async function signUpAndVerifyIfConfigured(page: Page, input: { name: string; email: string; password: string }): Promise<void> {
  await page.getByLabel("Name").fill(input.name);
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel("Password", { exact: true }).fill(input.password);
  await page.getByLabel("Confirm password").fill(input.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect.poll(async () => {
    if (new URL(page.url()).pathname === "/notebooks") return "notebooks";
    return await page.getByRole("status").filter({ hasText: "Check your email" }).isVisible().catch(() => false)
      ? "verification" : "waiting";
  }, { timeout: 10_000 }).not.toBe("waiting");

  if (new URL(page.url()).pathname !== "/notebooks") {
    await page.goto(await verificationLink(page, input.email));
    await page.goto("/notebooks");
  }
  await expect(page).toHaveURL(/\/notebooks$/);
}
