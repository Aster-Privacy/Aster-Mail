import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./playwright",
  testMatch: ["setup_demo_owner.spec.ts"],
  workers: 1, retries: 0, reporter: [["list"]],
  timeout: 240_000, expect: { timeout: 15_000 },
  use: { baseURL: "http://localhost:5173", trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
