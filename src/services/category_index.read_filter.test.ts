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

import { describe, it, expect, beforeEach } from "vitest";

import {
  upsert_entries,
  get_page_ids,
  get_category_total,
  mark_thread_read_entries,
  clear_category_index_memory,
} from "@/services/category_index";

function entry(
  id: string,
  thread_token: string | undefined,
  day: number,
  is_read: boolean,
): CategoryIndexEntry {
  return {
    id,
    thread_token,
    message_ts: `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`,
    is_read,
    category: "primary",
  };
}

describe("category_index read filter paging", () => {
  beforeEach(() => {
    clear_category_index_memory();
    upsert_entries([
      entry("r1", undefined, 20, true),
      entry("u1", undefined, 19, false),
      entry("r2", undefined, 18, true),
      entry("u2", undefined, 17, false),
      entry("t_old", "t1", 10, false),
      entry("t_new", "t1", 16, true),
      entry("r3", undefined, 15, true),
      entry("u3", undefined, 14, false),
    ]);
  });

  it("keeps the unfiltered behavior by default", () => {
    expect(get_category_total("primary")).toBe(7);
    expect(get_page_ids("primary", 0, 3)).toEqual(["r1", "u1", "r2"]);
  });

  it("pages unread conversations across the whole category", () => {
    expect(get_category_total("primary", "unread")).toBe(4);
    expect(get_page_ids("primary", 0, 3, "unread")).toEqual([
      "u1",
      "u2",
      "t_new",
    ]);
    expect(get_page_ids("primary", 1, 3, "unread")).toEqual(["u3"]);
  });

  it("matches the unread total to the ids every page returns", () => {
    const total = get_category_total("primary", "unread");
    const reachable = [
      ...get_page_ids("primary", 0, 3, "unread"),
      ...get_page_ids("primary", 1, 3, "unread"),
      ...get_page_ids("primary", 2, 3, "unread"),
    ];

    expect(reachable).toHaveLength(total);
  });

  it("pages read conversations and leaves out partly unread threads", () => {
    expect(get_category_total("primary", "read")).toBe(3);
    expect(get_page_ids("primary", 0, 10, "read")).toEqual(["r1", "r2", "r3"]);
  });

  it("keeps a shown row in its slot after it leaves the filter", () => {
    const kept = new Set(get_page_ids("primary", 0, 3, "unread"));

    mark_thread_read_entries("t1");

    expect(get_page_ids("primary", 0, 3, "unread", kept)).toEqual([
      "u1",
      "u2",
      "t_new",
    ]);
    expect(get_page_ids("primary", 1, 3, "unread", kept)).toEqual(["u3"]);
    expect(get_category_total("primary", "unread", kept)).toBe(4);
    expect(get_category_total("primary", "unread")).toBe(3);
  });
});
