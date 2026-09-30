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
  compare_folders_a_z,
  get_child_folders,
  is_folder_tree_sorted_a_z,
  is_sorted_a_z,
  place_folder_among_siblings,
  resort_after_rename,
  sort_folder_tree_a_z,
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

function names(list: DecryptedFolder[]): string[] {
  return list.map((f) => f.name);
}

function apply(
  folders: DecryptedFolder[],
  entries: { id: string; sort_order: number }[],
): DecryptedFolder[] {
  const order = new Map(entries.map((e) => [e.id, e.sort_order]));

  return folders.map((f) =>
    order.has(f.id) ? { ...f, sort_order: order.get(f.id)! } : f,
  );
}

describe("compare_folders_a_z", () => {
  it("ignores case and accents and compares numbers by value", () => {
    const sorted = [
      folder("f10", { name: "Folder 10" }),
      folder("b", { name: "banana" }),
      folder("f2", { name: "Folder 2" }),
      folder("e", { name: "Éclair" }),
      folder("a", { name: "Apple" }),
    ].sort(compare_folders_a_z);

    expect(names(sorted)).toEqual([
      "Apple",
      "banana",
      "Éclair",
      "Folder 2",
      "Folder 10",
    ]);
  });

  it("breaks name ties by creation time, then token", () => {
    const sorted = [
      folder("z", { name: "Work", created_at: "2026-02-01T00:00:00Z" }),
      folder("y", { name: "work", created_at: "2026-01-01T00:00:00Z" }),
      folder("x", { name: "Work", created_at: "2026-02-01T00:00:00Z" }),
    ].sort(compare_folders_a_z);

    expect(sorted.map((f) => f.folder_token)).toEqual(["y", "x", "z"]);
  });

  it("trims surrounding whitespace before comparing", () => {
    expect(
      is_sorted_a_z([
        folder("a", { name: "  Alpha" }),
        folder("b", { name: "Beta" }),
      ]),
    ).toBe(true);
  });
});

describe("sort_folder_tree_a_z", () => {
  it("sorts every level and only sends folders whose position changed", () => {
    const folders = [
      folder("c", { name: "Charlie", sort_order: 0 }),
      folder("a", { name: "Alpha", sort_order: 1 }),
      folder("b", { name: "Bravo", sort_order: 2 }),
      folder("a2", { name: "Zeta", parent_token: "a", sort_order: 0 }),
      folder("a1", { name: "Eta", parent_token: "a", sort_order: 1 }),
      folder("sys", { name: "Aaa", is_system: true, folder_type: "inbox" }),
    ];

    const entries = sort_folder_tree_a_z(folders);

    expect(entries).toEqual(
      expect.arrayContaining([
        { id: "id_a", sort_order: 0 },
        { id: "id_b", sort_order: 1 },
        { id: "id_c", sort_order: 2 },
        { id: "id_a1", sort_order: 0 },
        { id: "id_a2", sort_order: 1 },
      ]),
    );
    expect(entries).toHaveLength(5);
    expect(entries.some((e) => e.id === "id_sys")).toBe(false);

    const next = apply(folders, entries);
    const tree = build_folder_tree(next);

    expect(tree.map((n) => n.folder.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
    expect(tree[0].children.map((n) => n.folder.name)).toEqual(["Eta", "Zeta"]);
    expect(is_folder_tree_sorted_a_z(next)).toBe(true);
    expect(sort_folder_tree_a_z(next)).toEqual([]);
  });

  it("renumbers legacy folders that all share sort order 0", () => {
    const folders = [
      folder("b", { name: "Bravo", created_at: "2026-01-01T00:00:00Z" }),
      folder("a", { name: "Alpha", created_at: "2026-01-02T00:00:00Z" }),
    ];

    expect(is_folder_tree_sorted_a_z(folders)).toBe(false);
    expect(sort_folder_tree_a_z(folders)).toEqual([
      { id: "id_b", sort_order: 1 },
    ]);
    expect(
      names(
        get_child_folders(
          apply(folders, sort_folder_tree_a_z(folders)),
          undefined,
        ),
      ),
    ).toEqual(["Alpha", "Bravo"]);
  });

  it("treats folders with a missing parent as roots", () => {
    const folders = [
      folder("b", { name: "Bravo", sort_order: 0 }),
      folder("o", { name: "Orphan", parent_token: "gone", sort_order: 1 }),
      folder("a", { name: "Alpha", sort_order: 2 }),
    ];

    const next = apply(folders, sort_folder_tree_a_z(folders));

    expect(names(get_child_folders(next, undefined))).toEqual([
      "Alpha",
      "Bravo",
      "Orphan",
    ]);
  });
});

describe("place_folder_among_siblings", () => {
  it("inserts a new folder at its alphabetical position in a sorted list", () => {
    const siblings = [
      folder("a", { name: "Alpha", sort_order: 0 }),
      folder("c", { name: "Charlie", sort_order: 1 }),
    ];
    const entries = place_folder_among_siblings(
      siblings,
      folder("new", { name: "Bravo" }),
    );

    expect(entries).toEqual([
      { id: "id_new", sort_order: 1 },
      { id: "id_c", sort_order: 2 },
    ]);
  });

  it("appends to the end of a list the user ordered by hand", () => {
    const siblings = [
      folder("c", { name: "Charlie", sort_order: 0 }),
      folder("a", { name: "Alpha", sort_order: 1 }),
    ];

    expect(
      place_folder_among_siblings(siblings, folder("new", { name: "Bravo" })),
    ).toEqual([{ id: "id_new", sort_order: 2 }]);
  });

  it("places the first folder at position 0", () => {
    expect(
      place_folder_among_siblings([], folder("new", { name: "Solo" })),
    ).toEqual([{ id: "id_new", sort_order: 0 }]);
  });

  it("ignores the moved folder itself when it is already among the siblings", () => {
    const siblings = [
      folder("a", { name: "Alpha", sort_order: 0 }),
      folder("m", { name: "Mike", sort_order: 1 }),
      folder("z", { name: "Zulu", sort_order: 2 }),
    ];

    expect(
      place_folder_among_siblings(
        siblings,
        folder("m", { name: "Mike", sort_order: 1 }),
      ),
    ).toEqual([{ id: "id_m", sort_order: 1 }]);
  });
});

describe("resort_after_rename", () => {
  it("keeps a sorted list sorted after a rename", () => {
    const folders = [
      folder("a", { name: "Alpha", sort_order: 0 }),
      folder("b", { name: "Bravo", sort_order: 1 }),
      folder("c", { name: "Charlie", sort_order: 2 }),
    ];

    expect(resort_after_rename(folders, "id_a", "Delta")).toEqual([
      { id: "id_b", sort_order: 0 },
      { id: "id_c", sort_order: 1 },
      { id: "id_a", sort_order: 2 },
    ]);
  });

  it("leaves a hand-ordered list alone", () => {
    const folders = [
      folder("c", { name: "Charlie", sort_order: 0 }),
      folder("a", { name: "Alpha", sort_order: 1 }),
    ];

    expect(resort_after_rename(folders, "id_a", "Zulu")).toEqual([]);
  });

  it("only looks at the renamed folder's own siblings", () => {
    const folders = [
      folder("p", { name: "Parent", sort_order: 0 }),
      folder("q", { name: "Quebec", sort_order: 1 }),
      folder("x", { name: "Xray", parent_token: "p", sort_order: 0 }),
      folder("y", { name: "Yankee", parent_token: "p", sort_order: 1 }),
    ];

    expect(resort_after_rename(folders, "id_x", "Zulu")).toEqual([
      { id: "id_y", sort_order: 0 },
      { id: "id_x", sort_order: 1 },
    ]);
  });
});
