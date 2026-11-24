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
import type {
  CachedSubscription,
  SubscriptionCacheData,
} from "@/services/subscription_cache";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/api/client", () => ({
  api_client: { get: vi.fn(), put: vi.fn() },
}));

import {
  apply_deleted_subscriptions,
  is_deleted_subscription,
  MAX_DELETED_SUBSCRIPTIONS,
  merge_deleted_subscriptions,
  with_deleted_senders,
} from "@/services/subscription_cache";

function sub(sender_email: string, last_received: string): CachedSubscription {
  return {
    sender_email,
    sender_name: sender_email,
    domain: sender_email.split("@")[1],
    email_count: 1,
    last_received,
    category: "newsletter",
    status: "unsubscribed",
  } as CachedSubscription;
}

function cache(subscriptions: CachedSubscription[]): SubscriptionCacheData {
  return { subscriptions } as SubscriptionCacheData;
}

describe("deleted subscriptions", () => {
  it("removes the named senders and records a tombstone", () => {
    const next = with_deleted_senders(
      cache([
        sub("a@example.com", "2026-11-01T00:00:00Z"),
        sub("b@example.com", "2026-11-01T00:00:00Z"),
      ]),
      ["A@example.com"],
      "2026-11-10T00:00:00Z",
    );

    expect(next.subscriptions.map((s) => s.sender_email)).toEqual([
      "b@example.com",
    ]);
    expect(next.deleted).toEqual([
      { sender_email: "a@example.com", deleted_at: "2026-11-10T00:00:00Z" },
    ]);
  });

  it("removes a sender even when its last mail is dated in the future", () => {
    const next = with_deleted_senders(
      cache([sub("a@example.com", "2099-01-01T00:00:00Z")]),
      ["a@example.com"],
      "2026-11-10T00:00:00Z",
    );

    expect(next.subscriptions).toEqual([]);
  });

  it("keeps a deleted sender hidden when a scan re-adds the same mail", () => {
    const tombstones = [
      { sender_email: "a@example.com", deleted_at: "2026-11-10T00:00:00Z" },
    ];
    const rescanned = apply_deleted_subscriptions(
      cache([sub("a@example.com", "2026-11-01T00:00:00Z")]),
      tombstones,
    );

    expect(rescanned.subscriptions).toEqual([]);
    expect(rescanned.deleted).toEqual(tombstones);
  });

  it("shows a deleted sender again after newer mail arrives", () => {
    const tombstones = [
      { sender_email: "a@example.com", deleted_at: "2026-11-10T00:00:00Z" },
    ];

    expect(
      is_deleted_subscription(
        sub("a@example.com", "2026-11-12T00:00:00+01:00"),
        tombstones,
      ),
    ).toBe(false);
    expect(
      is_deleted_subscription(sub("a@example.com", "not a date"), tombstones),
    ).toBe(true);
    expect(
      is_deleted_subscription(
        sub("b@example.com", "2026-11-01T00:00:00Z"),
        tombstones,
      ),
    ).toBe(false);
  });

  it("merges tombstones, keeps the newest, and caps the list", () => {
    const merged = merge_deleted_subscriptions(
      [{ sender_email: "a@example.com", deleted_at: "2026-11-01T00:00:00Z" }],
      [
        { sender_email: "A@example.com", deleted_at: "2026-11-05T00:00:00Z" },
        { sender_email: "invalid", deleted_at: "2026-11-05T00:00:00Z" },
      ],
    );

    expect(merged).toEqual([
      { sender_email: "a@example.com", deleted_at: "2026-11-05T00:00:00Z" },
    ]);

    const many = Array.from(
      { length: MAX_DELETED_SUBSCRIPTIONS + 10 },
      (_, i) => ({
        sender_email: `s${i}@example.com`,
        deleted_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
      }),
    );

    expect(merge_deleted_subscriptions(many)).toHaveLength(
      MAX_DELETED_SUBSCRIPTIONS,
    );
  });

  it("drops an empty tombstone list", () => {
    const data = { ...cache([]), deleted: [] };

    expect("deleted" in apply_deleted_subscriptions(data)).toBe(false);
  });
});
