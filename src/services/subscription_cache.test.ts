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

import { describe, it, expect, vi, beforeEach } from "vitest";

const put_mock = vi.fn();

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(),
    put: (...args: unknown[]) => put_mock(...args),
  },
}));

import {
  compact_subscription_cache,
  save_subscription_cache,
  SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES,
} from "@/services/subscription_cache";

const BACKEND_BODY_LIMIT_BYTES = 1024 * 1024;

function make_subscription(
  index: number,
  overrides: Partial<CachedSubscription> = {},
): CachedSubscription {
  const day = new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString();

  return {
    sender_email: `sender${index}@list${index}.example`,
    sender_name: `Sender number ${index}`,
    domain: `list${index}.example`,
    email_count: (index % 50) + 1,
    last_received: day,
    unsubscribe_link: `https://list${index}.example/unsubscribe?token=${"t".repeat(120)}`,
    list_unsubscribe_header: `<https://list${index}.example/u/${"h".repeat(120)}>, <mailto:unsub@list${index}.example>`,
    list_unsubscribe_post: "List-Unsubscribe=One-Click",
    has_one_click: true,
    category: "newsletter",
    status: "active",
    ...overrides,
  };
}

function make_cache(count: number): SubscriptionCacheData {
  const subscriptions = Array.from({ length: count }, (_, i) =>
    make_subscription(i),
  );

  return {
    subscriptions,
    last_scan_ts: "2026-11-01T00:00:00.000Z",
    last_scan_message_ts: "2026-11-01T00:00:00.000Z",
    version: 4,
    scan_progress: {
      cursor: "cursor-token",
      last_scan_ts: "2026-11-01T00:00:00.000Z",
      last_scan_message_ts: "2026-11-01T00:00:00.000Z",
      carried: subscriptions.map((s) => s.sender_email),
    },
  };
}

function size_of(data: SubscriptionCacheData): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

const test_vault = {
  identity_key: "test-identity-key",
} as unknown as Parameters<typeof save_subscription_cache>[1];

describe("compact_subscription_cache", () => {
  it("returns the same object when the cache already fits", () => {
    const cache = make_cache(20);

    expect(compact_subscription_cache(cache)).toBe(cache);
  });

  it("brings an oversized cache under the byte budget", () => {
    const cache = make_cache(4000);

    expect(size_of(cache)).toBeGreaterThan(
      SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES,
    );

    const compacted = compact_subscription_cache(cache);

    expect(size_of(compacted)).toBeLessThanOrEqual(
      SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES,
    );
    expect(compacted.subscriptions.length).toBeGreaterThan(0);
    expect(compacted.subscriptions.length).toBeLessThan(4000);
  });

  it("keeps the largest number of entries that fits", () => {
    const cache = make_cache(4000);
    const compacted = compact_subscription_cache(cache);
    const kept = new Set(compacted.subscriptions.map((s) => s.sender_email));
    const next = cache.subscriptions
      .filter((s) => !kept.has(s.sender_email))
      .sort((a, b) => b.last_received.localeCompare(a.last_received))[0];
    const with_one_more: SubscriptionCacheData = {
      ...compacted,
      subscriptions: [...compacted.subscriptions, next],
      scan_progress: {
        ...compacted.scan_progress!,
        carried: [...compacted.scan_progress!.carried, next.sender_email],
      },
    };

    expect(size_of(with_one_more)).toBeGreaterThan(
      SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES,
    );
  });

  it("keeps every unsubscribed sender before any active one", () => {
    const cache = make_cache(4000);

    cache.subscriptions[0] = {
      ...cache.subscriptions[0],
      status: "unsubscribed",
      unsubscribed_at: "2026-02-01T00:00:00.000Z",
    };
    cache.subscriptions[1] = {
      ...cache.subscriptions[1],
      status: "unsubscribed",
      unsubscribed_at: "2026-02-01T00:00:00.000Z",
    };

    const compacted = compact_subscription_cache(cache);
    const emails = compacted.subscriptions.map((s) => s.sender_email);

    expect(emails).toContain("sender0@list0.example");
    expect(emails).toContain("sender1@list1.example");
  });

  it("drops the least recently seen active senders first", () => {
    const cache = make_cache(4000);
    const compacted = compact_subscription_cache(cache);
    const emails = new Set(compacted.subscriptions.map((s) => s.sender_email));

    expect(emails.has("sender3999@list3999.example")).toBe(true);
    expect(emails.has("sender2@list2.example")).toBe(false);
  });

  it("preserves the original order of the entries it keeps", () => {
    const cache = make_cache(4000);
    const compacted = compact_subscription_cache(cache);
    const positions = compacted.subscriptions.map((s) =>
      cache.subscriptions.findIndex((o) => o.sender_email === s.sender_email),
    );

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("limits the carried scan list to the senders it keeps", () => {
    const cache = make_cache(4000);
    const compacted = compact_subscription_cache(cache);
    const kept = new Set(compacted.subscriptions.map((s) => s.sender_email));

    expect(compacted.scan_progress).toBeDefined();
    expect(compacted.scan_progress!.cursor).toBe("cursor-token");
    expect(
      compacted.scan_progress!.carried.every((email) => kept.has(email)),
    ).toBe(true);
  });

  it("drops oversized unsubscribe fields before dropping senders", () => {
    const cache = make_cache(300);

    cache.subscriptions = cache.subscriptions.map((s) => ({
      ...s,
      list_unsubscribe_header: `<https://x.example/${"z".repeat(5000)}>`,
    }));

    expect(size_of(cache)).toBeGreaterThan(
      SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES,
    );

    const compacted = compact_subscription_cache(cache);

    expect(compacted.subscriptions.length).toBe(300);
    expect(
      compacted.subscriptions.every(
        (s) => s.list_unsubscribe_header === undefined,
      ),
    ).toBe(true);
    expect(compacted.subscriptions[0].unsubscribe_link).toBe(
      cache.subscriptions[0].unsubscribe_link,
    );
  });

  it("does not modify the input cache", () => {
    const cache = make_cache(4000);
    const snapshot = JSON.stringify(cache);

    compact_subscription_cache(cache);

    expect(JSON.stringify(cache)).toBe(snapshot);
  });

  it("handles invalid received dates without throwing", () => {
    const cache = make_cache(4000);

    cache.subscriptions[10] = {
      ...cache.subscriptions[10],
      last_received: "not a date",
    };

    expect(size_of(compact_subscription_cache(cache))).toBeLessThanOrEqual(
      SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES,
    );
  });
});

describe("compact_subscription_cache with malformed data", () => {
  it("compacts entries with missing or non-string fields", () => {
    const cache = make_cache(4000);

    cache.subscriptions[5] = {
      ...cache.subscriptions[5],
      sender_name: undefined as unknown as string,
      unsubscribe_link: 42 as unknown as string,
      email_count: "many" as unknown as number,
      last_received: null as unknown as string,
    };

    const compacted = compact_subscription_cache(cache);

    expect(size_of(compacted)).toBeLessThanOrEqual(
      SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES,
    );
    compacted.subscriptions.forEach((s) => {
      expect(typeof s.sender_name).toBe("string");
      expect(
        s.unsubscribe_link === undefined ||
          typeof s.unsubscribe_link === "string",
      ).toBe(true);
    });
  });

  it("compacts a cache whose scan progress has no carried list", () => {
    const cache = make_cache(4000);

    delete (cache.scan_progress as Partial<typeof cache.scan_progress>)!
      .carried;

    const compacted = compact_subscription_cache(cache);

    expect(size_of(compacted)).toBeLessThanOrEqual(
      SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES,
    );
    expect(compacted.scan_progress?.carried).toEqual([]);
  });

  it("does not throw when the subscription list is missing", () => {
    const cache = {
      last_scan_ts: "2026-11-01T00:00:00.000Z",
      scan_progress: {
        cursor: "c".repeat(SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES),
        last_scan_ts: "2026-11-01T00:00:00.000Z",
        last_scan_message_ts: "2026-11-01T00:00:00.000Z",
        carried: [],
      },
    } as unknown as SubscriptionCacheData;

    const compacted = compact_subscription_cache(cache);

    expect(compacted.subscriptions).toEqual([]);
    expect(compacted.scan_progress).toBeUndefined();
  });
});

describe("save_subscription_cache", () => {
  beforeEach(() => {
    put_mock.mockReset();
    put_mock.mockResolvedValue({ data: { success: true } });
  });

  it("sends a request body under the server limit for a huge cache", async () => {
    const saved = await save_subscription_cache(make_cache(6000), test_vault);

    expect(saved).toBe(true);
    expect(put_mock).toHaveBeenCalledTimes(1);

    const body = put_mock.mock.calls[0][1];
    const body_bytes = new TextEncoder().encode(JSON.stringify(body)).length;

    expect(body_bytes).toBeLessThan(BACKEND_BODY_LIMIT_BYTES);
  });
});
