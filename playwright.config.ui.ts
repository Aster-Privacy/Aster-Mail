import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright",
  testMatch: [
    "shift_select.spec.ts",
    "shared_context_menu.spec.ts",
    "keyboard_shortcuts_dispatch.spec.ts",
  ],
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
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
