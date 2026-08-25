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

import type { MailItem } from "@/services/api/mail";
import type { SubscriptionCacheData } from "@/services/subscription_cache";

import { describe, it, expect } from "vitest";

import {
  select_fresh_scan_items,
  should_run_full_scan,
} from "@/hooks/use_background_subscription_scan";

function cache(
  overrides: Partial<SubscriptionCacheData>,
): SubscriptionCacheData {
  return {
    subscriptions: [],
    last_scan_ts: "",
    ...overrides,
  };
}

function item(id: string, created_at: string, message_ts?: string): MailItem {
  return {
    id,
    item_type: "received",
    encrypted_envelope: "e",
    envelope_nonce: "n",
    folder_token: "",
    is_external: false,
    created_at,
    ...(message_ts ? { message_ts } : {}),
  } as MailItem;
}

describe("should_run_full_scan", () => {
  it("runs a full scan when there is no cache at all", () => {
    expect(should_run_full_scan(null)).toBe(true);
  });

  it("runs a full scan for an empty cache that has never been scanned", () => {
    expect(should_run_full_scan(cache({}))).toBe(true);
  });

  it("stays incremental for a scanned mailbox that found no subscriptions", () => {
    expect(
      should_run_full_scan(cache({ last_scan_ts: "2026-07-03T00:00:00Z" })),
    ).toBe(false);
  });

  it("stays incremental when only the message watermark is present", () => {
    expect(
      should_run_full_scan(
        cache({ last_scan_message_ts: "2026-07-03T00:00:00Z" }),
      ),
    ).toBe(false);
  });

  it("stays incremental when subscriptions exist", () => {
    expect(
      should_run_full_scan(
        cache({
          subscriptions: [
            {
              sender_email: "a@b.com",
              sender_name: "A",
              domain: "b.com",
              email_count: 1,
              last_received: "2026-07-03T00:00:00Z",
              has_one_click: false,
              category: "newsletter",
              status: "active",
            },
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe("select_fresh_scan_items", () => {
  it("returns every item and never stops when there is no watermark", () => {
    const items = [
      item("a", "2026-07-03T00:00:00Z", "2026-07-03T00:00:00Z"),
      item("b", "2026-07-02T00:00:00Z", "2026-07-02T00:00:00Z"),
    ];

    const result = select_fresh_scan_items(items, "", "");

    expect(result.fresh_items).toEqual(items);
    expect(result.stop).toBe(false);
  });

  it("stops at the first item at or below the message_ts watermark", () => {
    const items = [
      item("new1", "2026-07-05T00:00:00Z", "2026-07-05T00:00:00Z"),
      item("new2", "2026-07-04T00:00:00Z", "2026-07-04T00:00:00Z"),
      item("old1", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z"),
      item("old2", "2026-06-30T00:00:00Z", "2026-06-30T00:00:00Z"),
    ];

    const result = select_fresh_scan_items(
      items,
      "2026-07-03T00:00:00Z",
      "2026-07-03T00:00:00Z",
    );

    expect(result.fresh_items.map((i) => i.id)).toEqual(["new1", "new2"]);
    expect(result.stop).toBe(true);
  });

  it("treats an item exactly on the watermark as already seen", () => {
    const items = [
      item("same", "2026-07-03T00:00:00Z", "2026-07-03T00:00:00Z"),
    ];

    const result = select_fresh_scan_items(
      items,
      "2026-07-03T00:00:00Z",
      "2026-07-03T00:00:00Z",
    );

    expect(result.fresh_items).toEqual([]);
    expect(result.stop).toBe(true);
  });

  it("keeps paginating while a page is entirely newer than the watermark", () => {
    const items = [
      item("new1", "2026-07-05T00:00:00Z", "2026-07-05T00:00:00Z"),
      item("new2", "2026-07-04T00:00:00Z", "2026-07-04T00:00:00Z"),
    ];

    const result = select_fresh_scan_items(
      items,
      "2026-07-01T00:00:00Z",
      "2026-07-01T00:00:00Z",
    );

    expect(result.fresh_items.map((i) => i.id)).toEqual(["new1", "new2"]);
    expect(result.stop).toBe(false);
  });

  it("falls back to message_ts absent by using created_at as the sort key", () => {
    const items = [
      item("new1", "2026-07-05T00:00:00Z"),
      item("old1", "2026-07-01T00:00:00Z"),
    ];

    const result = select_fresh_scan_items(
      items,
      "2026-07-03T00:00:00Z",
      "2026-07-03T00:00:00Z",
    );

    expect(result.fresh_items.map((i) => i.id)).toEqual(["new1"]);
    expect(result.stop).toBe(true);
  });

  it("still filters by created_at when message_ts leads created_at", () => {
    const items = [
      item("lagging", "2026-07-02T00:00:00Z", "2026-07-09T00:00:00Z"),
      item("fresh", "2026-07-08T00:00:00Z", "2026-07-08T00:00:00Z"),
    ];

    const result = select_fresh_scan_items(
      items,
      "2026-07-03T00:00:00Z",
      "2026-07-01T00:00:00Z",
    );

    expect(result.fresh_items.map((i) => i.id)).toEqual(["fresh"]);
    expect(result.stop).toBe(false);
  });

  describe("legacy caches without a message_ts watermark", () => {
    it("stops after a page with nothing newer than last_scan_ts", () => {
      const items = [
        item("old1", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z"),
        item("old2", "2026-06-30T00:00:00Z", "2026-06-30T00:00:00Z"),
      ];

      const result = select_fresh_scan_items(items, "2026-07-03T00:00:00Z", "");

      expect(result.fresh_items).toEqual([]);
      expect(result.stop).toBe(true);
    });

    it("keeps paginating while a page still yields fresh items", () => {
      const items = [
        item("new1", "2026-07-05T00:00:00Z", "2026-07-05T00:00:00Z"),
        item("old1", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z"),
      ];

      const result = select_fresh_scan_items(items, "2026-07-03T00:00:00Z", "");

      expect(result.fresh_items.map((i) => i.id)).toEqual(["new1"]);
      expect(result.stop).toBe(false);
    });

    it("scans the whole page rather than breaking early", () => {
      const items = [
        item("old1", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z"),
        item("new1", "2026-07-05T00:00:00Z", "2026-07-05T00:00:00Z"),
      ];

      const result = select_fresh_scan_items(items, "2026-07-03T00:00:00Z", "");

      expect(result.fresh_items.map((i) => i.id)).toEqual(["new1"]);
      expect(result.stop).toBe(false);
    });
  });

  describe("backfilled mail dated older than its arrival", () => {
    it("does not stop on an item that is newly created but old-dated", () => {
      const items = [
        item("imported", "2026-07-08T00:00:00Z", "2020-01-01T00:00:00Z"),
        item("older", "2026-07-01T00:00:00Z", "2026-07-01T00:00:00Z"),
      ];

      const result = select_fresh_scan_items(
        items,
        "2026-07-03T00:00:00Z",
        "2026-07-05T00:00:00Z",
      );

      expect(result.fresh_items.map((i) => i.id)).toEqual(["imported"]);
      expect(result.stop).toBe(true);
    });

    it("keeps paginating past an old-dated import to reach further imports", () => {
      const items = [
        item("imported1", "2026-07-08T00:00:00Z", "2019-01-01T00:00:00Z"),
        item("imported2", "2026-07-08T00:00:00Z", "2018-01-01T00:00:00Z"),
      ];

      const result = select_fresh_scan_items(
        items,
        "2026-07-03T00:00:00Z",
        "2026-07-05T00:00:00Z",
      );

      expect(result.fresh_items.map((i) => i.id)).toEqual([
        "imported1",
        "imported2",
      ]);
      expect(result.stop).toBe(false);
    });
  });

  it("returns an empty page unchanged and defers to the cursor", () => {
    const result = select_fresh_scan_items(
      [],
      "2026-07-03T00:00:00Z",
      "2026-07-03T00:00:00Z",
    );

    expect(result.fresh_items).toEqual([]);
    expect(result.stop).toBe(false);
  });
});
