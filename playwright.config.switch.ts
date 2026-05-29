import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright",
  testMatch: ["account_switch_e2e.spec.ts"],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 300_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://app.localhost:5173",
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
