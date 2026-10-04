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
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  list_subscriptions: vi.fn(),
  track_subscription: vi.fn(),
  unsubscribe: vi.fn(),
  reactivate_subscription: vi.fn(),
}));

vi.mock("@/services/api/subscriptions", () => ({
  list_subscriptions: h.list_subscriptions,
  track_subscription: h.track_subscription,
  unsubscribe: h.unsubscribe,
  reactivate_subscription: h.reactivate_subscription,
}));

const {
  UNSUBSCRIBE_EVENT,
  RESUBSCRIBE_EVENT,
  clear_unsubscribed_senders_cache,
  load_unsubscribed_senders,
  normalize_sender_email,
  persist_resubscribe,
  persist_unsubscribe,
} = await import("./use_unsubscribed_senders");

function page(sender_emails: string[], has_more: boolean) {
  return {
    data: {
      subscriptions: sender_emails.map((sender_email) => ({ sender_email })),
      total: sender_emails.length,
      has_more,
    },
  };
}

describe("unsubscribed senders", () => {
  beforeEach(() => {
    clear_unsubscribed_senders_cache();
    h.list_subscriptions.mockReset();
    h.track_subscription.mockReset();
    h.unsubscribe.mockReset();
    h.reactivate_subscription.mockReset();
    h.track_subscription.mockResolvedValue({
      data: { success: true, subscription_id: "sub-1", is_new: false },
    });
    h.unsubscribe.mockResolvedValue({ data: { success: true } });
    h.reactivate_subscription.mockResolvedValue({ data: { success: true } });
  });

  it("normalizes sender addresses", () => {
    expect(normalize_sender_email("  News@Example.COM ")).toBe(
      "news@example.com",
    );
  });

  it("loads every page of unsubscribed senders", async () => {
    h.list_subscriptions
      .mockResolvedValueOnce(page(["a@example.com"], true))
      .mockResolvedValueOnce(page(["b@example.com"], false));

    expect(await load_unsubscribed_senders()).toBe(true);
    expect(h.list_subscriptions).toHaveBeenCalledTimes(2);
    expect(h.list_subscriptions).toHaveBeenNthCalledWith(1, {
      status: "unsubscribed",
      limit: 100,
      offset: 0,
    });
    expect(h.list_subscriptions).toHaveBeenNthCalledWith(2, {
      status: "unsubscribed",
      limit: 100,
      offset: 100,
    });
  });

  it("shares one request between concurrent loads", async () => {
    h.list_subscriptions.mockResolvedValue(page([], false));

    await Promise.all([
      load_unsubscribed_senders(),
      load_unsubscribed_senders(),
    ]);

    expect(h.list_subscriptions).toHaveBeenCalledTimes(1);
  });

  it("records an unsubscribe without repeating the sender request", async () => {
    const events: string[] = [];
    const listener = (e: Event) =>
      events.push((e as CustomEvent).detail.sender_email);

    window.addEventListener(UNSUBSCRIBE_EVENT, listener);
    await persist_unsubscribe(" News@Example.com ", "News", {
      unsubscribe_link: "mailto:leave@example.com",
      list_unsubscribe_header: "<https://example.com/u>",
    });
    window.removeEventListener(UNSUBSCRIBE_EVENT, listener);

    expect(events).toEqual([" News@Example.com "]);
    expect(h.track_subscription).toHaveBeenCalledWith({
      sender_email: "news@example.com",
      sender_name: "News",
      unsubscribe_link: undefined,
      list_unsubscribe_header: "<https://example.com/u>",
    });
    expect(h.unsubscribe).toHaveBeenCalledWith("sub-1", "manual");
  });

  it("never uploads a link that came from the message body", async () => {
    await persist_unsubscribe("news@example.com", "News", {
      unsubscribe_link: "https://example.com/body/secret-token",
      list_unsubscribe_header: "<https://example.com/u>",
    });

    const payload = h.track_subscription.mock.calls[0][0];

    expect(payload.unsubscribe_link).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("secret-token");
  });

  it("uploads a link that the List-Unsubscribe header carries", async () => {
    await persist_unsubscribe("news@example.com", "News", {
      unsubscribe_link: "https://example.com/u",
      list_unsubscribe_header: "<https://example.com/u>",
    });

    expect(h.track_subscription.mock.calls[0][0].unsubscribe_link).toBe(
      "https://example.com/u",
    );
  });

  it("ignores a sender without an address", async () => {
    await persist_unsubscribe("not an address", "", {});

    expect(h.track_subscription).not.toHaveBeenCalled();
  });

  it("reactivates a sender on resubscribe", async () => {
    const listener = vi.fn();

    window.addEventListener(RESUBSCRIBE_EVENT, listener);
    await persist_resubscribe("News@Example.com");
    window.removeEventListener(RESUBSCRIBE_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(h.track_subscription).toHaveBeenCalledWith({
      sender_email: "news@example.com",
    });
    expect(h.reactivate_subscription).toHaveBeenCalledWith("sub-1");
  });
});
