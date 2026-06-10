import { chromium } from "@playwright/test";

const APP_URL = "http://localhost:5173";
const TIMESTAMP = Date.now();
const TEST_USERNAME = `hwktest${TIMESTAMP}`;
const TEST_PASSWORD = "Test@HardwareKey123!";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ baseURL: APP_URL });
  const page = await ctx.newPage();

  // --- Registration flow to get a real authenticated session ---
  console.log("Navigating to register page...");
  await page.goto(APP_URL + "/register");
  await page.waitForLoadState("networkidle");

  const create_btn = page.getByRole("button", { name: "Create free account" });
  await create_btn.waitFor({ timeout: 10000 });
  await create_btn.click();

  const username_input = page.locator("input[autocomplete='username']");
  await username_input.waitFor({ timeout: 10000 });
  await username_input.fill(TEST_USERNAME);

  await page.getByRole("button", { name: "Next" }).first().click();

  const pw_inputs = page.locator("input[autocomplete='new-password']");
  await pw_inputs.first().waitFor({ timeout: 10000 });
  await pw_inputs.first().fill(TEST_PASSWORD);
  await pw_inputs.nth(1).fill(TEST_PASSWORD);

  await page.getByRole("button", { name: "Next" }).first().click();
  console.log("Generating keys...");

  await page.waitForFunction(
    () => {
      const all = Array.from(document.querySelectorAll("button"));
      return all.some(
        (b) =>
          b.textContent?.includes("Continue without download") ||
          b.textContent?.includes("Download key"),
      );
    },
    { timeout: 60000 },
  );

  const continue_without = page.getByRole("button", { name: /continue without download/i });
  if (await continue_without.count() > 0) {
    await continue_without.click();
    await wait(500);
    const continue_anyway = page.getByRole("button", { name: /continue anyway/i });
    if (await continue_anyway.count() > 0) await continue_anyway.click();
  }

  await wait(1000);
  const skip_btn = page.getByRole("button", { name: /skip for now/i });
  if (await skip_btn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await skip_btn.click();
  }

  await wait(1000);
  const free_btn = page.getByRole("button", { name: /continue as free/i });
  if (await free_btn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await free_btn.click();
  }

  await page.waitForURL((url) => !url.toString().includes("/register"), { timeout: 30000 });
  console.log("Registered and logged in.");

  // --- Open Settings > Security via custom event ---
  await wait(2000);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("navigate-settings", { detail: "security" }));
  });
  await wait(2000);

  // --- Set up virtual cross-platform USB authenticator ---
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "usb",
      hasResidentKey: false,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  console.log("Virtual USB authenticator ready.");

  // --- Intercept hardware key API calls ---
  const api_responses = [];
  await page.route("**/hardware-keys/**", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    api_responses.push({ url: route.request().url(), status: response.status(), body });
    await route.fulfill({ response, body });
  });

  // --- Find and click "Add security key" ---
  const add_security_key_btn = page.getByRole("button", { name: /add security key/i });
  const btn_count = await add_security_key_btn.count();
  if (btn_count === 0) {
    console.error("'Add security key' button not found");
    await page.screenshot({ path: "test_no_btn.png" });
    await browser.close();
    process.exit(1);
  }

  console.log("Clicking 'Add security key'...");
  await add_security_key_btn.first().click();
  await wait(6000);

  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });

  const initiation_ok = api_responses.some((r) => r.url.includes("register/initiate") && r.status === 200);
  const completion_ok = api_responses.some(
    (r) => r.url.includes("register/complete") && r.status === 200 && r.body.includes('"success":true'),
  );

  console.log("\n=== RESULT ===");
  for (const r of api_responses) {
    console.log(`  ${r.status} ${r.url.split("/").slice(-3).join("/")} → ${r.body.substring(0, 80)}`);
  }

  if (initiation_ok && completion_ok) {
    console.log("\nPASS: Security key registered end-to-end!");
    await browser.close();
    process.exit(0);
  }

  const failed = api_responses.find((r) => r.url.includes("register/") && r.status !== 200);
  if (failed) {
    console.log("\nFAIL:", failed.status, failed.url.split("/").slice(-2).join("/"), failed.body);
  } else {
    console.log("\nFAIL: No hardware key API calls made (WebAuthn cancelled or blocked)");
    await page.screenshot({ path: "test_result.png" });
  }
  await browser.close();
  process.exit(1);
}

run().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
