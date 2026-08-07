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
  note_recent_pin,
  clear_recent_pin,
  get_index_entries,
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

const NOTIFY_SETTLE_MS = 400;

function settle(): void {
  vi.advanceTimersByTime(NOTIFY_SETTLE_MS);
}

describe("category_index recent pin guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clear_category_index_memory();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a just-pinned category when a server echo carries the old one", () => {
    upsert_entries([entry("m1", "promotions")]);
    note_recent_pin("m1", "primary");
    upsert_entries([entry("m1", "primary", { category_pinned: true })]);

    upsert_entries([entry("m1", "promotions")]);
    settle();

    expect(get_page_ids("primary", 0, 50)).toEqual(["m1"]);
    expect(get_page_ids("promotions", 0, 50)).toEqual([]);
  });

  it("lets the server win again once the pin is cleared", () => {
    upsert_entries([entry("m1", "promotions")]);
    note_recent_pin("m1", "primary");
    upsert_entries([entry("m1", "primary", { category_pinned: true })]);
    clear_recent_pin("m1");

    upsert_entries([entry("m1", "promotions")]);
    settle();

    expect(get_page_ids("promotions", 0, 50)).toEqual(["m1"]);
  });

  it("snapshots entries so a failed move can be restored", () => {
    upsert_entries([entry("m1", "promotions", { category_pinned: true })]);

    const snapshot = get_index_entries(["m1", "missing"]);

    note_recent_pin("m1", "primary");
    upsert_entries([entry("m1", "primary", { category_pinned: true })]);
    settle();
    expect(get_page_ids("primary", 0, 50)).toEqual(["m1"]);

    note_recent_pin("m1", snapshot[0]!.category);
    upsert_entries(snapshot);
    settle();

    expect(snapshot).toHaveLength(1);
    expect(get_page_ids("promotions", 0, 50)).toEqual(["m1"]);
    expect(get_page_ids("primary", 0, 50)).toEqual([]);
  });
});
