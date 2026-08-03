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

import { describe, it, expect, beforeEach } from "vitest";

import {
  upsert_entries,
  get_counts,
  get_new_heads,
  mark_category_seen,
  set_ids_read,
  clear_category_index_memory,
} from "@/services/category_index";

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

describe("category_index get_new_heads", () => {
  beforeEach(() => {
    clear_category_index_memory();
  });

  it("returns nothing when no tab has new mail", () => {
    upsert_entries([entry("m1", { is_read: true })]);

    expect(get_counts().primary!.new_count).toBe(0);
    expect(get_new_heads().size).toBe(0);
  });

  it("points at the newest new message of each tab", () => {
    upsert_entries([
      entry("p_old", { message_ts: "2026-07-01T00:00:00.000Z" }),
      entry("p_new", { message_ts: "2026-07-02T00:00:00.000Z" }),
      entry("promo_old", {
        category: "promotions",
        message_ts: "2026-07-01T00:00:00.000Z",
      }),
      entry("promo_new", {
        category: "promotions",
        message_ts: "2026-07-03T00:00:00.000Z",
      }),
    ]);

    const heads = get_new_heads();

    expect(heads.get("primary")).toBe("p_new");
    expect(heads.get("promotions")).toBe("promo_new");
  });

  it("drops a tab once it has been seen", () => {
    upsert_entries([
      entry("m1", { category: "promotions" }),
      entry("m2", { category: "social" }),
    ]);

    expect(get_new_heads().size).toBe(2);

    mark_category_seen("promotions");

    const heads = get_new_heads();

    expect(heads.has("promotions")).toBe(false);
    expect(heads.get("social")).toBe("m2");
  });

  it("ignores read mail", () => {
    upsert_entries([
      entry("read_new", {
        category: "promotions",
        message_ts: "2026-07-05T00:00:00.000Z",
        is_read: true,
      }),
      entry("unread_older", {
        category: "promotions",
        message_ts: "2026-07-04T00:00:00.000Z",
      }),
    ]);

    expect(get_new_heads().get("promotions")).toBe("unread_older");

    set_ids_read(["unread_older"], true);

    expect(get_new_heads().has("promotions")).toBe(false);
  });

  it("uses the thread representative, not an older sibling", () => {
    upsert_entries([
      entry("t_first", {
        thread_token: "t1",
        category: "updates",
        message_ts: "2026-07-01T00:00:00.000Z",
      }),
      entry("t_latest", {
        thread_token: "t1",
        category: "updates",
        message_ts: "2026-07-06T00:00:00.000Z",
      }),
    ]);

    expect(get_new_heads().get("updates")).toBe("t_latest");
  });

  it("follows the pinned tab when a conversation was moved", () => {
    upsert_entries([
      entry("m1", {
        thread_token: "t1",
        category: "primary",
        category_pinned: true,
        message_ts: "2026-07-01T00:00:00.000Z",
      }),
      entry("m2", {
        thread_token: "t1",
        category: "promotions",
        message_ts: "2026-07-02T00:00:00.000Z",
      }),
    ]);

    const heads = get_new_heads();

    expect(heads.get("primary")).toBe("m2");
    expect(heads.has("promotions")).toBe(false);
  });
});
