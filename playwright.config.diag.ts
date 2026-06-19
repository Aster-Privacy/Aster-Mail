import { defineConfig, devices } from "@playwright/test";
export default defineConfig({ testDir: "./playwright", testMatch: ["diag_login.spec.ts"], workers: 1, retries: 0, reporter: [["list"]], timeout: 60000, use: { baseURL: "http://localhost:5173" }, projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }] });
