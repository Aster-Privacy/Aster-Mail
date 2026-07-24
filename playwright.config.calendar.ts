import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright",
  testMatch: ["_calendar_diag.spec.ts"],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:5199",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
