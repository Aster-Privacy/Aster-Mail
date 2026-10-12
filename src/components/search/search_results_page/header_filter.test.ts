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

import { apply_header_filter, header_filter_for_query } from "./header_filter";

describe("header_filter_for_query", () => {
  it.each([
    ["report", "all"],
    ["report is:unread", "unread"],
    ["report is:read", "read"],
    ["report has:attachment", "attachments"],
    ["report has:attachments", "attachments"],
    ["report -is:unread", "all"],
    ["report NOT has:attachment", "all"],
    ["report has:pdf", "all"],
  ])("reads %s as %s", (query, filter) => {
    expect(header_filter_for_query(query)).toBe(filter);
  });
});

describe("apply_header_filter", () => {
  it("writes the filter into the query", () => {
    expect(apply_header_filter("report", "unread")).toBe("report is:unread");
    expect(apply_header_filter("report", "read")).toBe("report is:read");
    expect(apply_header_filter("report", "attachments")).toBe(
      "report has:attachment",
    );
  });

  it("replaces the previous header filter", () => {
    expect(apply_header_filter("report is:unread", "attachments")).toBe(
      "report has:attachment",
    );
    expect(apply_header_filter("is:read report", "unread")).toBe(
      "report is:unread",
    );
  });

  it("removes the header filter for all and keeps everything else", () => {
    expect(
      apply_header_filter("report is:unread from:alice in:trash", "all"),
    ).toBe("report from:alice in:trash");
  });

  it("keeps a negated filter that the header does not own", () => {
    expect(apply_header_filter("report -is:unread", "attachments")).toBe(
      "report -is:unread has:attachment",
    );
  });

  it("round trips through the query", () => {
    for (const filter of ["unread", "read", "attachments", "all"] as const) {
      expect(
        header_filter_for_query(apply_header_filter("report", filter)),
      ).toBe(filter);
    }
  });
});
