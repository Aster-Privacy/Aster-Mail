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
  DeletedSubscription,
  SubscriptionCacheData,
} from "@/services/subscription_cache";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/api/client", () => ({
  api_client: { get: vi.fn(), put: vi.fn() },
}));

import {
  apply_deleted_subscriptions,
  MAX_DELETED_SUBSCRIPTIONS,
  MAX_DELETED_SUBSCRIPTIONS_CEILING,
  merge_deleted_subscriptions,
  SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES,
  with_deleted_senders,
} from "@/services/subscription_cache";

const RECEIVED = "2026-11-01T00:00:00.000Z";
const OLD_DELETE = "2026-11-05T00:00:00.000Z";
const BULK_DELETE = "2026-11-10T00:00:00.000Z";
const LATER_DELETE = "2026-11-12T00:00:00.000Z";

function sub(sender_email: string): CachedSubscription {
  return {
    sender_email,
    sender_name: "",
    domain: sender_email.split("@")[1],
    email_count: 1,
    last_received: RECEIVED,
    has_one_click: false,
    category: "unknown",
    status: "active",
  };
}

function senders(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}@example.com`);
}

function records(emails: string[], deleted_at: string): DeletedSubscription[] {
  return emails.map((sender_email) => ({ sender_email, deleted_at }));
}

describe("deleting many subscription senders at once", () => {
  it("keeps a record for every sender in one large delete", () => {
    const emails = senders("bulk", 1500);
    const deleted = with_deleted_senders(
      { subscriptions: emails.map(sub), last_scan_ts: "" },
      emails,
      BULK_DELETE,
    );

    expect(deleted.subscriptions).toHaveLength(0);
    expect(deleted.deleted).toHaveLength(1500);

    const rescanned: SubscriptionCacheData = {
      ...deleted,
      subscriptions: emails.map(sub),
    };

    expect(apply_deleted_subscriptions(rescanned).subscriptions).toEqual([]);
  });

  it("evicts older records before records from the newest delete", () => {
    const old = records(senders("old", 900), OLD_DELETE);
    const bulk = records(senders("bulk", 1500), BULK_DELETE);
    const merged = merge_deleted_subscriptions(old, bulk);

    expect(merged).toHaveLength(1500);
    expect(merged.every((d) => d.deleted_at === BULK_DELETE)).toBe(true);
  });

  it("keeps a delete whole when the cap falls inside it", () => {
    const later = records(senders("later", 300), LATER_DELETE);
    const bulk = records(senders("bulk", 1500), BULK_DELETE);
    const old = records(senders("old", 400), OLD_DELETE);
    const merged = merge_deleted_subscriptions(old, bulk, later);

    expect(merged).toHaveLength(1800);
    const newest = merged.slice(0, 300);

    expect(newest.every((d) => d.deleted_at === LATER_DELETE)).toBe(true);
    expect(merged.some((d) => d.deleted_at === OLD_DELETE)).toBe(false);
  });

  it("still keeps the cap for records from separate deletes", () => {
    const many = Array.from(
      { length: MAX_DELETED_SUBSCRIPTIONS + 50 },
      (_, i) => ({
        sender_email: `s${i}@example.com`,
        deleted_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
      }),
    );

    expect(merge_deleted_subscriptions(many)).toHaveLength(
      MAX_DELETED_SUBSCRIPTIONS,
    );
  });

  it("never keeps more than the ceiling", () => {
    const huge = records(
      senders("huge", MAX_DELETED_SUBSCRIPTIONS_CEILING + 500),
      BULK_DELETE,
    );

    expect(merge_deleted_subscriptions(huge)).toHaveLength(
      MAX_DELETED_SUBSCRIPTIONS_CEILING,
    );
  });

  it("sets the ceiling above the number of subscriptions a cache can hold", () => {
    const smallest = JSON.stringify(sub("a@b.co"));
    const most_stored = Math.floor(
      SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES / (smallest.length + 1),
    );

    expect(most_stored).toBeLessThan(MAX_DELETED_SUBSCRIPTIONS_CEILING);
  });
});
