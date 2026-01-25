import { device, element, by, expect, waitFor } from "detox";

describe("Offline Mode", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it("should show offline indicator when network is disconnected", async () => {
    await device.setStatusBar({
      networkMode: "offline",
    });

    await waitFor(element(by.id("offline-indicator")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("should compose email while offline", async () => {
    await device.setStatusBar({
      networkMode: "offline",
    });

    await element(by.id("compose-button")).tap();

    await element(by.id("to-input")).typeText("offline@example.com");
    await element(by.id("to-input")).tapReturnKey();

    await element(by.id("subject-input")).typeText("Offline Email");
    await element(by.id("body-input")).typeText("Sent while offline.");

    await element(by.id("send-button")).tap();

    await expect(element(by.text("Will send when online"))).toBeVisible();
  });

  it("should queue actions while offline", async () => {
    await device.setStatusBar({
      networkMode: "offline",
    });

    await element(by.id("email-item-0")).swipe("left", "fast", 0.7);

    await expect(element(by.text("Queued"))).toBeVisible();
  });

  it("should process queue when network is restored", async () => {
    await device.setStatusBar({
      networkMode: "offline",
    });

    await element(by.id("email-item-0")).swipe("left", "fast", 0.7);

    await device.setStatusBar({
      networkMode: "wifi",
    });

    await waitFor(element(by.text("Synced")))
      .toBeVisible()
      .withTimeout(10000);
  });

  it("should show pending actions count in settings", async () => {
    await device.setStatusBar({
      networkMode: "offline",
    });

    await element(by.id("email-item-0")).swipe("left", "fast", 0.7);
    await element(by.id("email-item-1")).swipe("left", "fast", 0.7);

    await element(by.id("menu-button")).tap();
    await element(by.text("Settings")).tap();

    await expect(element(by.text("2 actions waiting to sync"))).toBeVisible();
  });
});
