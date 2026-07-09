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
import type { CategoryIndexEntry } from "@/services/category_index";
import type { EmailCategory } from "@/types/email";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  upsert_entries,
  get_counts,
  get_page_ids,
  remove_thread_entries,
  mark_category_seen,
  clear_category_index_memory,
} from "@/services/category_index";

const BASE_NOW = new Date("2026-07-09T12:00:00.000Z").getTime();

function entry(
  id: string,
  overrides: Partial<CategoryIndexEntry> = {},
): CategoryIndexEntry {
  return {
    id,
    thread_token: undefined,
    message_ts: "2026-07-01T00:00:00.000Z",
    is_read: false,
    category: "primary" as EmailCategory,
    ...overrides,
  };
}

describe("category_index pinned rep election", () => {
  beforeEach(() => {
    clear_category_index_memory();
  });

  it("keeps a moved conversation in its pinned tab when a newer unpinned reply arrives", () => {
    upsert_entries([
      entry("m1", {
        thread_token: "t1",
        message_ts: "2026-07-01T00:00:00.000Z",
        category: "primary",
        category_pinned: true,
      }),
      entry("m2", {
        thread_token: "t1",
        message_ts: "2026-07-02T00:00:00.000Z",
        category: "promotions",
      }),
    ]);

    expect(get_page_ids("primary", 0, 50)).toEqual(["m2"]);
    expect(get_page_ids("promotions", 0, 50)).toEqual([]);
    expect(get_counts().primary.total).toBe(1);
    expect(get_counts().promotions.total).toBe(0);
  });

  it("the newest pin wins when a thread was re-moved", () => {
    upsert_entries([
      entry("m1", {
        thread_token: "t1",
        message_ts: "2026-07-01T00:00:00.000Z",
        category: "promotions",
        category_pinned: true,
      }),
      entry("m2", {
        thread_token: "t1",
        message_ts: "2026-07-02T00:00:00.000Z",
        category: "updates",
        category_pinned: true,
      }),
    ]);

    expect(get_page_ids("updates", 0, 50)).toEqual(["m2"]);
    expect(get_page_ids("promotions", 0, 50)).toEqual([]);
  });

  it("unpinned threads still follow the newest message's category", () => {
    upsert_entries([
      entry("m1", {
        thread_token: "t1",
        message_ts: "2026-07-01T00:00:00.000Z",
        category: "primary",
      }),
      entry("m2", {
        thread_token: "t1",
        message_ts: "2026-07-02T00:00:00.000Z",
        category: "social",
      }),
    ]);

    expect(get_page_ids("social", 0, 50)).toEqual(["m2"]);
    expect(get_page_ids("primary", 0, 50)).toEqual([]);
  });
});

describe("category_index remove_thread_entries", () => {
  beforeEach(() => {
    clear_category_index_memory();
  });

  it("removes every entry of the thread so no sibling is re-elected", () => {
    upsert_entries([
      entry("m1", { thread_token: "t1" }),
      entry("m2", {
        thread_token: "t1",
        message_ts: "2026-07-02T00:00:00.000Z",
      }),
      entry("other"),
    ]);

    expect(get_counts().primary.total).toBe(2);

    remove_thread_entries("t1");

    expect(get_counts().primary.total).toBe(1);
    expect(get_page_ids("primary", 0, 50)).toEqual(["other"]);
  });
});

describe("category_index mark_category_seen clock clamp", () => {
  beforeEach(() => {
    clear_category_index_memory();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BASE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears the new badge for mail up to now when the tab is viewed", () => {
    upsert_entries([
      entry("past", {
        message_ts: new Date(BASE_NOW - 60 * 60 * 1000).toISOString(),
      }),
    ]);

    expect(get_counts().primary.new_count).toBe(1);

    mark_category_seen("primary");

    expect(get_counts().primary.new_count).toBe(0);
    expect(get_counts().primary.unread).toBe(1);
  });

  it("does not let one future-dated message blind the badge to genuinely new mail", () => {
    upsert_entries([
      entry("future_spam", {
        message_ts: new Date(BASE_NOW + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ]);

    mark_category_seen("primary");

    // A normal message arriving "now" (after the view) must still count as new,
    // even though a far-future-dated message is present in the tab.
    upsert_entries([
      entry("fresh", {
        message_ts: new Date(BASE_NOW + 1000).toISOString(),
      }),
    ]);

    expect(get_counts().primary.new_count).toBeGreaterThanOrEqual(1);
  });
});
