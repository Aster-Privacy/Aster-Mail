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
  set_sort_order,
  get_sort_order,
  clear_category_index_memory,
} from "@/services/category_index";

function entry(id: string, message_ts: string): CategoryIndexEntry {
  return {
    id,
    thread_token: undefined,
    message_ts,
    is_read: true,
    category: "primary",
  };
}

function force_order(order: "asc" | "desc") {
  set_sort_order(order === "asc" ? "desc" : "asc");
  set_sort_order(order);
}

describe("category_index sort order", () => {
  beforeEach(() => {
    clear_category_index_memory();
    upsert_entries([
      entry("oldest", "2020-01-01T00:00:00.000Z"),
      entry("middle", "2022-01-01T00:00:00.000Z"),
      entry("newest", "2024-01-01T00:00:00.000Z"),
    ]);
  });

  it("defaults to newest first (descending)", () => {
    force_order("desc");
    expect(get_page_ids("primary", 0, 50)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  it("orders oldest first when ascending is selected", () => {
    force_order("asc");
    expect(get_sort_order()).toBe("asc");
    expect(get_page_ids("primary", 0, 50)).toEqual([
      "oldest",
      "middle",
      "newest",
    ]);
  });

  it("flips order live without re-ingesting entries", () => {
    force_order("desc");
    expect(get_page_ids("primary", 0, 50)[0]).toBe("newest");

    set_sort_order("asc");
    expect(get_page_ids("primary", 0, 50)[0]).toBe("oldest");

    set_sort_order("desc");
    expect(get_page_ids("primary", 0, 50)[0]).toBe("newest");
  });
});
