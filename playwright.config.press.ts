//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { defineConfig, devices } from "@playwright/test";

const base_url = process.env.PRESS_AUDIT_URL ?? "http://localhost:5192";

export default defineConfig({
  testDir: "./perf_budget",
  testMatch: ["press_audit.spec.ts"],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 300_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: base_url,
    bypassCSP: true,
    trace: "off",
    screenshot: "off",
    video: "off",
    viewport: { width: 1440, height: 900 },
  },
  webServer: process.env.PRESS_AUDIT_URL
    ? undefined
    : {
        command: "npx vite --port 5192 --strictPort",
        url: base_url,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: process.env.PRESS_AUDIT_BROWSER
          ? { executablePath: process.env.PRESS_AUDIT_BROWSER }
          : {},
      },
    },
  ],
});
