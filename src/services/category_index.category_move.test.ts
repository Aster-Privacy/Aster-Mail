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
  get_page_ids,
  get_index_entries,
  get_thread_category,
  set_thread_grouping,
  apply_category_pin_locally,
  restore_category_entry_locally,
  clear_category_index_memory,
} from "@/services/category_index";

function entry(
  id: string,
  category: EmailCategory,
  overrides: Partial<CategoryIndexEntry> = {},
): CategoryIndexEntry {
  return {
    id,
    message_ts: "2026-07-01T00:00:00.000Z",
    is_read: false,
    category,
    ...overrides,
  };
}

function settle(): void {
  vi.advanceTimersByTime(400);
}

describe("category_index category move", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clear_category_index_memory();
    set_thread_grouping(true);
  });

  afterEach(() => {
    set_thread_grouping(true);
    vi.useRealTimers();
  });

  it("keeps the starred flag when a message is pinned to a category", () => {
    upsert_entries([entry("m1", "promotions", { is_pinned: true })]);

    apply_category_pin_locally({ id: "m1" }, "primary");
    settle();

    const [moved] = get_index_entries(["m1"]);

    expect(moved).toMatchObject({
      category: "primary",
      category_pinned: true,
      is_pinned: true,
    });
    expect(get_page_ids("primary", 0, 50)).toEqual(["m1"]);
  });

  it("restores the snapshot without undoing a newer read or star change", () => {
    upsert_entries([entry("m1", "promotions")]);
    const [snapshot] = get_index_entries(["m1"]);

    apply_category_pin_locally({ id: "m1" }, "primary");
    upsert_entries([
      {
        ...get_index_entries(["m1"])[0]!,
        is_read: true,
        is_pinned: true,
      },
    ]);

    restore_category_entry_locally("m1", snapshot);
    settle();

    expect(get_index_entries(["m1"])[0]).toMatchObject({
      category: "promotions",
      is_read: true,
      is_pinned: true,
    });
    expect(get_index_entries(["m1"])[0]!.category_pinned).toBeFalsy();
    expect(get_page_ids("promotions", 0, 50)).toEqual(["m1"]);
  });

  it("removes an entry that did not exist before the move", () => {
    apply_category_pin_locally(
      { id: "m1", raw_timestamp: "2026-07-01T00:00:00.000Z" },
      "primary",
    );
    settle();
    expect(get_index_entries(["m1"])).toHaveLength(1);

    restore_category_entry_locally("m1");
    settle();

    expect(get_index_entries(["m1"])).toEqual([]);
    expect(get_page_ids("primary", 0, 50)).toEqual([]);
  });

  it("files a thread under the newest pinned message", () => {
    upsert_entries([
      entry("m1", "promotions", {
        thread_token: "t1",
        message_ts: "2026-07-01T00:00:00.000Z",
        category_pinned: true,
      }),
      entry("m2", "social", {
        thread_token: "t1",
        message_ts: "2026-07-02T00:00:00.000Z",
      }),
    ]);

    expect(get_thread_category("t1")).toBe("promotions");
  });

  it("files a thread under its newest message when nothing is pinned", () => {
    upsert_entries([
      entry("m1", "promotions", {
        thread_token: "t1",
        message_ts: "2026-07-01T00:00:00.000Z",
      }),
      entry("m2", "social", {
        thread_token: "t1",
        message_ts: "2026-07-02T00:00:00.000Z",
      }),
    ]);

    expect(get_thread_category("t1")).toBe("social");
  });

  it("ignores threads when conversation grouping is off", () => {
    upsert_entries([entry("m1", "promotions", { thread_token: "t1" })]);
    set_thread_grouping(false);

    expect(get_thread_category("t1")).toBeNull();
    expect(get_thread_category(undefined)).toBeNull();
  });
});
