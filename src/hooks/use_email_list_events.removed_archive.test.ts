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
import { describe, it, expect } from "vitest";

import { removal_keeps_rows_in_view } from "./use_email_list_events";

describe("removal_keeps_rows_in_view", () => {
  it("keeps archived rows in views that include archived mail", () => {
    for (const view of ["starred", "all", "archive", "folder-x", "tag-y"]) {
      expect(removal_keeps_rows_in_view("archive", view)).toBe(true);
    }
  });

  it("removes archived rows from the inbox", () => {
    expect(removal_keeps_rows_in_view("archive", "inbox")).toBe(false);
  });

  it("removes trashed and spam rows everywhere else", () => {
    expect(removal_keeps_rows_in_view("trash", "starred")).toBe(false);
    expect(removal_keeps_rows_in_view("spam", "all")).toBe(false);
    expect(removal_keeps_rows_in_view(undefined, "starred")).toBe(false);
  });
});
