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
import { describe, expect, it } from "vitest";

import {
  apply_mobile_filter,
  is_mobile_filter_active,
} from "./mobile_search_filters";

describe("apply_mobile_filter", () => {
  it.each([
    ["unread", "report is:unread"],
    ["attachments", "report has:attachment"],
    ["starred", "report is:starred"],
  ] as const)("maps the %s chip to %s", (filter, query) => {
    expect(apply_mobile_filter("report", filter)).toBe(query);
    expect(is_mobile_filter_active(query, filter)).toBe(true);
    expect(apply_mobile_filter(query, filter)).toBe("report");
  });

  it("combines chips in one query", () => {
    const query = apply_mobile_filter(
      apply_mobile_filter("report", "unread"),
      "starred",
    );

    expect(query).toBe("report is:unread is:starred");
    expect(is_mobile_filter_active(query, "unread")).toBe(true);
    expect(is_mobile_filter_active(query, "starred")).toBe(true);
    expect(is_mobile_filter_active(query, "attachments")).toBe(false);
    expect(is_mobile_filter_active(query, "all")).toBe(false);
  });

  it("clears the chip operators for all and keeps the rest", () => {
    expect(
      apply_mobile_filter(
        "report is:unread has:attachment is:starred from:alice in:trash",
        "all",
      ),
    ).toBe("report from:alice in:trash");
  });

  it("shows all as active when no chip operator is present", () => {
    expect(is_mobile_filter_active("report from:alice", "all")).toBe(true);
    expect(is_mobile_filter_active("report -is:unread", "unread")).toBe(false);
  });
});
