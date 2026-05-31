import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./playwright",
  testMatch: ["probe_signin.spec.ts"],
  fullyParallel: false, retries: 0, workers: 1,
  reporter: [["list"]], timeout: 180000, expect: { timeout: 15000 },
  use: { baseURL: "http://app.localhost:5173", trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
