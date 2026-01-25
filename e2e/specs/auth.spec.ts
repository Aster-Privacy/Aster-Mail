import { device, element, by, expect } from "detox";

describe("Authentication", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it("should show login screen when not authenticated", async () => {
    await expect(element(by.text("Sign in"))).toBeVisible();
  });

  it("should navigate to register screen", async () => {
    await element(by.text("Create account")).tap();
    await expect(element(by.text("Create your account"))).toBeVisible();
  });

  it("should show validation errors for empty login", async () => {
    await element(by.text("Sign in")).tap();
    await expect(element(by.text("Email is required"))).toBeVisible();
  });

  it("should login with valid credentials", async () => {
    await element(by.id("email-input")).typeText("test@astermail.org");
    await element(by.id("password-input")).typeText("testpassword123");
    await element(by.text("Sign in")).tap();

    await expect(element(by.text("Inbox"))).toBeVisible();
  });

  it("should handle biometric unlock when enabled", async () => {
    await device.setBiometricEnrollment(true);

    await device.matchFace();

    await expect(element(by.text("Inbox"))).toBeVisible();
  });
});
