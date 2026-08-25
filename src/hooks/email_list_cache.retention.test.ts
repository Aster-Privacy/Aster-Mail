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

import { view_cache, get_view_cache, set_view_cache } from "./email_list_cache";

function make_state(count: number) {
  return {
    emails: Array.from({ length: count }, (_, i) => ({ id: `m${i}` })),
    total_messages: count,
    has_initial_load: true,
    is_loading: false,
    has_load_error: false,
  } as never;
}

function cache_view(view: string, time: number) {
  set_view_cache(view, {
    state: make_state(3),
    time,
    is_stale: false,
    conversation_grouping: true,
    page: 0,
  });
}

describe("a visited view stays cached so it renders without a skeleton", () => {
  beforeEach(() => {
    view_cache.clear();
  });

  it("keeps sent cached after a long tour of other views", () => {
    cache_view("sent", 0);

    for (let i = 0; i < 20; i++) {
      cache_view(`folder_${i}`, i + 1);
    }

    expect(get_view_cache("sent")?.state.emails.length).toBe(3);
  });

  it("evicts the least recently opened view, not the least recently written", () => {
    for (let i = 0; i < 32; i++) {
      cache_view(`folder_${i}`, i);
    }

    get_view_cache("folder_0");
    cache_view("newest", 100);

    expect(get_view_cache("folder_0")).toBeDefined();
    expect(view_cache.has("folder_1")).toBe(false);
  });
});
