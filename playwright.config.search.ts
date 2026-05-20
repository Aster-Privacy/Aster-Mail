import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://app.localhost:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: {
      args: ["--host-resolver-rules=MAP app.localhost 127.0.0.1"],
    },
  },
  projects: [
    {
      name: "setup",
      testMatch: /fixtures\/logged_in_setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testMatch: /search_content_toggle\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
