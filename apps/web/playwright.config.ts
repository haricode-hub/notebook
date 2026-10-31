import { setDefaultResultOrder } from "node:dns";
import { defineConfig } from "@playwright/test";

if (process.platform === "win32") setDefaultResultOrder("ipv4first");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    launchOptions: process.platform === "win32"
      ? { args: ["--host-resolver-rules=MAP localhost 127.0.0.1"] }
      : undefined,
  },
});
