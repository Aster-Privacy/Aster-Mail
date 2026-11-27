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

import {
  view_cache,
  get_view_cache,
  set_view_cache,
  remove_email_from_view_cache,
} from "./email_list_cache";
import { is_settled_empty_list } from "./email_list_types";

function cache_view(view: string, ids: string[], total = ids.length) {
  set_view_cache(view, {
    state: {
      emails: ids.map((id) => ({ id })),
      total_messages: total,
      has_initial_load: true,
      is_loading: false,
      is_loading_more: false,
      has_more: false,
      has_load_error: false,
    } as never,
    time: 0,
    is_stale: false,
    conversation_grouping: true,
    page: 0,
  });
}

describe("an emptied folder keeps its cached empty result", () => {
  beforeEach(() => {
    view_cache.clear();
  });

  it("keeps a settled empty entry when the last email leaves the folder", () => {
    cache_view("trash", ["m1"]);

    remove_email_from_view_cache("m1");

    const cached = get_view_cache("trash");

    expect(cached).toBeDefined();
    expect(cached?.is_stale).toBe(true);
    expect(cached && is_settled_empty_list(cached.state)).toBe(true);
  });

  it("drops the entry when the server still has more mail for the folder", () => {
    cache_view("inbox", ["m1"], 5);

    remove_email_from_view_cache("m1");

    expect(get_view_cache("inbox")).toBeUndefined();
  });
});
