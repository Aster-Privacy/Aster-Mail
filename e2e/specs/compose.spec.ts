import { device, element, by, expect } from "detox";

describe("Compose Email", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it("should open compose screen", async () => {
    await element(by.id("compose-button")).tap();
    await expect(element(by.text("Compose"))).toBeVisible();
  });

  it("should add recipient", async () => {
    await element(by.id("compose-button")).tap();
    await element(by.id("to-input")).typeText("recipient@example.com");
    await element(by.id("to-input")).tapReturnKey();

    await expect(element(by.text("recipient@example.com"))).toBeVisible();
  });

  it("should compose and send email", async () => {
    await element(by.id("compose-button")).tap();

    await element(by.id("to-input")).typeText("recipient@example.com");
    await element(by.id("to-input")).tapReturnKey();

    await element(by.id("subject-input")).typeText("Test Email Subject");
    await element(by.id("body-input")).typeText("This is a test email body.");

    await element(by.id("send-button")).tap();

    await expect(element(by.text("Email sent"))).toBeVisible();
  });

  it("should save draft when closing without sending", async () => {
    await element(by.id("compose-button")).tap();

    await element(by.id("to-input")).typeText("draft@example.com");
    await element(by.id("subject-input")).typeText("Draft Email");

    await element(by.id("close-button")).tap();

    await element(by.text("Drafts")).tap();
    await expect(element(by.text("Draft Email"))).toBeVisible();
  });

  it("should attach file", async () => {
    await element(by.id("compose-button")).tap();
    await element(by.id("attach-button")).tap();

    await expect(element(by.text("Choose file"))).toBeVisible();
  });
});
