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
import type { DecryptedFolder } from "@/hooks/use_folders";

import { describe, it, expect } from "vitest";

import {
  build_folder_tree,
  flatten_visible_tree,
  get_sibling_folders,
  compare_sibling_folders,
} from "@/hooks/use_folders";

function folder(
  token: string,
  overrides: Partial<DecryptedFolder> = {},
): DecryptedFolder {
  return {
    id: `id_${token}`,
    folder_token: token,
    name: token,
    is_system: false,
    is_locked: false,
    folder_type: "custom",
    is_password_protected: false,
    password_set: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("build_folder_tree ordering", () => {
  it("sorts root folders by sort_order", () => {
    const tree = build_folder_tree([
      folder("b", { sort_order: 2 }),
      folder("a", { sort_order: 0 }),
      folder("c", { sort_order: 1 }),
    ]);

    expect(tree.map((n) => n.folder.folder_token)).toEqual(["a", "c", "b"]);
  });

  it("sorts children within each parent by sort_order", () => {
    const tree = build_folder_tree([
      folder("root"),
      folder("child_b", { sort_order: 1, parent_token: "root" }),
      folder("child_a", { sort_order: 0, parent_token: "root" }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((n) => n.folder.folder_token)).toEqual([
      "child_a",
      "child_b",
    ]);
  });

  it("breaks ties by created_at", () => {
    const tree = build_folder_tree([
      folder("newer", { created_at: "2026-02-01T00:00:00Z" }),
      folder("older", { created_at: "2026-01-01T00:00:00Z" }),
    ]);

    expect(tree.map((n) => n.folder.folder_token)).toEqual(["older", "newer"]);
  });

  it("treats folders with unknown parents as roots", () => {
    const tree = build_folder_tree([
      folder("orphan", { parent_token: "deleted", sort_order: 5 }),
      folder("normal", { sort_order: 0 }),
    ]);

    expect(tree.map((n) => n.folder.folder_token)).toEqual([
      "normal",
      "orphan",
    ]);
  });

  it("keeps flattened order depth-first with sorted siblings", () => {
    const tree = build_folder_tree([
      folder("root_b", { sort_order: 1 }),
      folder("root_a", { sort_order: 0 }),
      folder("child", { parent_token: "root_a" }),
    ]);
    const flat = flatten_visible_tree(tree, new Set(["root_a"]));

    expect(flat.map((n) => n.folder.folder_token)).toEqual([
      "root_a",
      "child",
      "root_b",
    ]);
  });
});

describe("get_sibling_folders", () => {
  it("returns sorted siblings sharing the same parent", () => {
    const folders = [
      folder("root_a", { sort_order: 0 }),
      folder("root_b", { sort_order: 1 }),
      folder("child_b", { sort_order: 1, parent_token: "root_a" }),
      folder("child_a", { sort_order: 0, parent_token: "root_a" }),
    ];

    expect(
      get_sibling_folders(folders, "id_child_b").map((f) => f.folder_token),
    ).toEqual(["child_a", "child_b"]);
    expect(
      get_sibling_folders(folders, "id_root_a").map((f) => f.folder_token),
    ).toEqual(["root_a", "root_b"]);
  });

  it("groups folders with dangling parents with the roots", () => {
    const folders = [
      folder("orphan", { parent_token: "gone", sort_order: 0 }),
      folder("root", { sort_order: 1 }),
    ];

    expect(
      get_sibling_folders(folders, "id_orphan").map((f) => f.folder_token),
    ).toEqual(["orphan", "root"]);
  });

  it("returns an empty list for unknown ids", () => {
    expect(get_sibling_folders([folder("a")], "missing")).toEqual([]);
  });
});

describe("compare_sibling_folders", () => {
  it("orders by sort_order before created_at", () => {
    const first = folder("x", {
      sort_order: 0,
      created_at: "2026-03-01T00:00:00Z",
    });
    const second = folder("y", {
      sort_order: 1,
      created_at: "2026-01-01T00:00:00Z",
    });

    expect(compare_sibling_folders(first, second)).toBeLessThan(0);
  });
});
