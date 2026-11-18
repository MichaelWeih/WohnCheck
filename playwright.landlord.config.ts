import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "landlord.spec.ts",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:8080",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
  },
  outputDir: "artifacts/landlord/tests",
  reporter: "list",
});
