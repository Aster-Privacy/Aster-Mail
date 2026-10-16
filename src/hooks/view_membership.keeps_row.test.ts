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

import { archive_keeps_row, unarchive_keeps_row } from "./view_membership";

describe("archive_keeps_row", () => {
  it.each([
    "all",
    "starred",
    "snoozed",
    "sent",
    "folder-a",
    "tag-b",
    "alias-c",
  ])("keeps the row in %s", (view) => {
    expect(archive_keeps_row(view)).toBe(true);
  });

  it.each(["inbox", "", "archive", "trash", "spam", "drafts"])(
    "removes the row in %s",
    (view) => {
      expect(archive_keeps_row(view)).toBe(false);
    },
  );
});

describe("unarchive_keeps_row", () => {
  it.each(["all", "starred", "folder-a", "tag-b", "inbox"])(
    "keeps the row in %s",
    (view) => {
      expect(unarchive_keeps_row(view)).toBe(true);
    },
  );

  it.each(["archive", "trash", "spam"])("removes the row in %s", (view) => {
    expect(unarchive_keeps_row(view)).toBe(false);
  });
});
