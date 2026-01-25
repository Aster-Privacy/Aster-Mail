import { device, element, by, expect, waitFor } from "detox";

describe("Swipe Actions", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it("should archive email on swipe left", async () => {
    await waitFor(element(by.id("email-item-0")))
      .toBeVisible()
      .withTimeout(10000);

    const first_email_subject = await element(
      by.id("email-item-0-subject"),
    ).getAttributes();

    await element(by.id("email-item-0")).swipe("left", "fast", 0.7);

    await expect(element(by.text("Archived"))).toBeVisible();
    await expect(element(by.text(first_email_subject.text))).not.toBeVisible();
  });

  it("should mark email as read on swipe right", async () => {
    await waitFor(element(by.id("email-item-0")))
      .toBeVisible()
      .withTimeout(10000);

    await element(by.id("email-item-0")).swipe("right", "fast", 0.5);

    await expect(element(by.text("Marked as read"))).toBeVisible();
  });

  it("should delete email on long swipe left", async () => {
    await waitFor(element(by.id("email-item-0")))
      .toBeVisible()
      .withTimeout(10000);

    await element(by.id("email-item-0")).swipe("left", "fast", 0.9);

    await expect(element(by.text("Moved to trash"))).toBeVisible();
  });

  it("should snooze email on long swipe right", async () => {
    await waitFor(element(by.id("email-item-0")))
      .toBeVisible()
      .withTimeout(10000);

    await element(by.id("email-item-0")).swipe("right", "fast", 0.9);

    await expect(element(by.text("Snooze"))).toBeVisible();
  });

  it("should trigger haptic feedback on swipe threshold", async () => {
    await waitFor(element(by.id("email-item-0")))
      .toBeVisible()
      .withTimeout(10000);

    await element(by.id("email-item-0")).swipe("left", "slow", 0.3);
  });
});
