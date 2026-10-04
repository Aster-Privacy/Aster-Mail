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
  FOLDER_OPTION_INDENT_PX,
  folder_option_indent,
  order_folders_as_tree,
  type DecryptedFolder,
} from "@/hooks/use_folders/tree";

const folder = (
  folder_token: string,
  sort_order: number,
  parent_token?: string,
  is_system = false,
): DecryptedFolder => ({
  id: folder_token,
  folder_token,
  name: folder_token,
  is_system,
  is_locked: false,
  folder_type: is_system ? "inbox" : "folder",
  is_password_protected: false,
  password_set: false,
  sort_order,
  parent_token,
  created_at: "",
  updated_at: "",
});

const summarize = (folders: DecryptedFolder[]) =>
  order_folders_as_tree(folders).map(
    (entry) => `${entry.depth}:${entry.folder.folder_token}`,
  );

describe("order_folders_as_tree", () => {
  it("lists each child directly under its parent with its depth", () => {
    expect(
      summarize([
        folder("grandchild", 0, "child"),
        folder("second", 1),
        folder("child", 0, "first"),
        folder("first", 0),
        folder("second_child", 0, "second"),
      ]),
    ).toEqual([
      "0:first",
      "1:child",
      "2:grandchild",
      "0:second",
      "1:second_child",
    ]);
  });

  it("leaves system folders out", () => {
    expect(
      summarize([folder("inbox", 0, undefined, true), folder("work", 1)]),
    ).toEqual(["0:work"]);
  });

  it("treats a folder whose parent is missing as a top-level folder", () => {
    expect(summarize([folder("orphan", 0, "gone")])).toEqual(["0:orphan"]);
  });

  it("still lists folders that the tree cannot place", () => {
    expect(
      summarize([
        folder("top", 0),
        folder("loop_a", 1, "loop_b"),
        folder("loop_b", 2, "loop_a"),
      ]),
    ).toEqual(["0:top", "0:loop_a", "0:loop_b"]);
  });
});

describe("folder_option_indent", () => {
  it("does not indent a top-level folder", () => {
    expect(folder_option_indent(0)).toBe(0);
    expect(folder_option_indent(undefined)).toBe(0);
  });

  it("indents one step for each level of nesting", () => {
    expect(folder_option_indent(1)).toBe(FOLDER_OPTION_INDENT_PX);
    expect(folder_option_indent(3)).toBe(FOLDER_OPTION_INDENT_PX * 3);
  });
});
