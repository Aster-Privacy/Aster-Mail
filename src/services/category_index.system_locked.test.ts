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
  get_thread_category,
  note_recent_pin,
  apply_category_pins_locally,
  clear_category_index_memory,
} from "@/services/category_index";

function entry(
  id: string,
  category: EmailCategory,
  overrides: Partial<CategoryIndexEntry> = {},
): CategoryIndexEntry {
  return {
    id,
    message_ts: "2026-11-20T00:00:00.000Z",
    is_read: false,
    category,
    ...overrides,
  };
}

function settle(): void {
  vi.advanceTimersByTime(400);
}

describe("category_index system mail lock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clear_category_index_memory();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps system mail pinned to deals in primary", () => {
    upsert_entries([
      entry("m1", "promotions", { category_pinned: true, system_locked: true }),
    ]);
    settle();

    expect(get_page_ids("primary", 0, 50)).toEqual(["m1"]);
    expect(get_page_ids("promotions", 0, 50)).toEqual([]);
    expect(get_counts().promotions?.total ?? 0).toBe(0);
  });

  it("keeps a thread in primary when one member is pinned to deals and another is system mail", () => {
    upsert_entries([
      entry("m1", "primary", {
        thread_token: "t1",
        message_ts: "2026-11-19T00:00:00.000Z",
        system_locked: true,
      }),
      entry("m2", "promotions", {
        thread_token: "t1",
        message_ts: "2026-11-20T00:00:00.000Z",
        category_pinned: true,
      }),
    ]);
    settle();

    expect(get_page_ids("primary", 0, 50)).toEqual(["m2"]);
    expect(get_page_ids("promotions", 0, 50)).toEqual([]);
    expect(get_thread_category("t1")).toBe("primary");
  });

  it("still honors a pin on a normal thread", () => {
    upsert_entries([
      entry("m1", "primary", {
        thread_token: "t2",
        message_ts: "2026-11-19T00:00:00.000Z",
      }),
      entry("m2", "promotions", {
        thread_token: "t2",
        message_ts: "2026-11-20T00:00:00.000Z",
        category_pinned: true,
      }),
    ]);
    settle();

    expect(get_page_ids("promotions", 0, 50)).toEqual(["m2"]);
    expect(get_thread_category("t2")).toBe("promotions");
  });

  it("ignores a local move and a stale echo for system mail", () => {
    upsert_entries([entry("m1", "primary", { system_locked: true })]);

    apply_category_pins_locally([{ id: "m1" }], "promotions");
    note_recent_pin("m1", "promotions");
    upsert_entries([entry("m1", "promotions", { category_pinned: true })]);
    settle();

    expect(get_page_ids("primary", 0, 50)).toEqual(["m1"]);
    expect(get_page_ids("promotions", 0, 50)).toEqual([]);
  });
});
