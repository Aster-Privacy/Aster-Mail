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
import { describe, it, expect, beforeEach } from "vitest";

import { view_cache, set_view_cache } from "./email_list_cache";
import { derive_page_from_list_length } from "./use_email_list";

function make_state(count: number) {
  return {
    emails: Array.from({ length: count }, (_, i) => ({ id: `m${i}` })),
    total_messages: count,
    has_initial_load: true,
    is_loading: false,
    has_load_error: false,
  } as never;
}

describe("a restored view keeps the page it was actually on", () => {
  beforeEach(() => {
    view_cache.clear();
  });

  it("survives thread grouping shrinking the visible list", () => {
    set_view_cache("inbox", {
      state: make_state(60),
      time: 0,
      is_stale: false,
      conversation_grouping: true,
      page: 2,
      page_offsets: [
        [1, 50],
        [2, 100],
        [3, 150],
      ],
    });

    const cached = view_cache.get("inbox");

    expect(cached?.page).toBe(2);
    expect(derive_page_from_list_length(60, 50)).toBe(1);
    expect(new Map(cached!.page_offsets!).get(3)).toBe(150);
  });

  it("falls back to the derived page for an entry saved without one", () => {
    set_view_cache("inbox", {
      state: make_state(120),
      time: 0,
      is_stale: false,
      conversation_grouping: true,
    });

    const cached = view_cache.get("inbox");

    expect(cached?.page).toBeUndefined();
    expect(
      cached?.page ??
        derive_page_from_list_length(cached!.state.emails.length, 50),
    ).toBe(2);
  });
});
