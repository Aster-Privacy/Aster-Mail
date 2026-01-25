import { device, element, by, expect, waitFor } from "detox";

describe("Email List", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it("should show inbox emails", async () => {
    await waitFor(element(by.id("email-list")))
      .toBeVisible()
      .withTimeout(10000);

    await expect(element(by.id("email-list"))).toBeVisible();
  });

  it("should navigate to email detail on tap", async () => {
    await element(by.id("email-item-0")).tap();
    await expect(element(by.id("email-detail"))).toBeVisible();
  });

  it("should pull to refresh", async () => {
    await element(by.id("email-list")).swipe("down", "slow");
    await expect(element(by.id("refresh-indicator"))).toBeVisible();
  });

  it("should navigate between folders", async () => {
    await element(by.id("menu-button")).tap();
    await element(by.text("Sent")).tap();
    await expect(element(by.text("Sent"))).toBeVisible();

    await element(by.id("menu-button")).tap();
    await element(by.text("Drafts")).tap();
    await expect(element(by.text("Drafts"))).toBeVisible();
  });

  it("should select multiple emails with long press", async () => {
    await element(by.id("email-item-0")).longPress();
    await expect(element(by.id("selection-mode"))).toBeVisible();

    await element(by.id("email-item-1")).tap();
    await expect(element(by.text("2 selected"))).toBeVisible();
  });

  it("should search emails", async () => {
    await element(by.id("search-button")).tap();
    await element(by.id("search-input")).typeText("important");
    await element(by.id("search-input")).tapReturnKey();

    await waitFor(element(by.id("search-results")))
      .toBeVisible()
      .withTimeout(5000);
  });
});
