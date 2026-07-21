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
  get_counts,
  is_representative_unread,
  mark_thread_read_entries,
  clear_category_index_memory,
} from "@/services/category_index";

function entry(
  id: string,
  thread_token: string | undefined,
  message_ts: string,
  is_read: boolean,
): CategoryIndexEntry {
  return {
    id,
    thread_token,
    message_ts,
    is_read,
    category: "primary",
  };
}

describe("category_index thread read entries", () => {
  beforeEach(() => {
    clear_category_index_memory();
    upsert_entries([
      entry("m1", "t1", "2026-01-01T00:00:00.000Z", true),
      entry("m2", "t1", "2026-01-02T00:00:00.000Z", false),
      entry("m3", "t1", "2026-01-03T00:00:00.000Z", false),
      entry("other", "t2", "2026-01-04T00:00:00.000Z", false),
      entry("single", undefined, "2026-01-05T00:00:00.000Z", false),
    ]);
  });

  it("clears every unread sibling of the thread so the representative stops counting as unread", () => {
    expect(get_counts().primary!.unread).toBe(3);
    expect(is_representative_unread("m3")).toBe(true);

    mark_thread_read_entries("t1");

    expect(get_counts().primary!.unread).toBe(2);
    expect(is_representative_unread("m3")).toBe(false);
  });

  it("leaves other threads and standalone messages untouched", () => {
    mark_thread_read_entries("t1");

    expect(is_representative_unread("other")).toBe(true);
    expect(is_representative_unread("single")).toBe(true);
  });

  it("is a no-op for an unknown or empty thread token", () => {
    mark_thread_read_entries("missing");
    mark_thread_read_entries("");

    expect(get_counts().primary!.unread).toBe(3);
  });
});
