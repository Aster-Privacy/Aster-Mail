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
  apply_tag_orders,
  get_sibling_tags,
  is_tag_tree_sorted_a_z,
  plan_tag_sibling_move,
  sort_tag_tree_a_z,
  type TagTreeItem,
} from "@/hooks/tag_tree";

function make_tag(
  name: string,
  sort_order: number,
  parent?: string,
): TagTreeItem {
  return {
    id: `id-${name}`,
    tag_token: `token-${name}`,
    name,
    sort_order,
    parent_token: parent ? `token-${parent}` : undefined,
  };
}

const tags = [
  make_tag("work", 0),
  make_tag("home", 1),
  make_tag("bills", 2),
  make_tag("zeta", 0, "work"),
  make_tag("alpha", 1, "work"),
];

describe("tag sibling ordering", () => {
  it("returns only siblings at the same level", () => {
    expect(get_sibling_tags(tags, "id-alpha").map((t) => t.name)).toEqual([
      "zeta",
      "alpha",
    ]);
    expect(get_sibling_tags(tags, "id-home").map((t) => t.name)).toEqual([
      "work",
      "home",
      "bills",
    ]);
  });

  it("plans a move up by renumbering only changed siblings", () => {
    expect(plan_tag_sibling_move(tags, "id-home", -1)).toEqual([
      { id: "id-home", sort_order: 0 },
      { id: "id-work", sort_order: 1 },
    ]);
  });

  it("refuses to move past either end", () => {
    expect(plan_tag_sibling_move(tags, "id-work", -1)).toBeNull();
    expect(plan_tag_sibling_move(tags, "id-bills", 1)).toBeNull();
    expect(plan_tag_sibling_move(tags, "id-missing", 1)).toBeNull();
  });

  it("never moves a child out of its parent", () => {
    const plan = plan_tag_sibling_move(tags, "id-alpha", -1);

    expect(plan).toEqual([
      { id: "id-alpha", sort_order: 0 },
      { id: "id-zeta", sort_order: 1 },
    ]);
  });

  it("sorts every level A to Z", () => {
    expect(is_tag_tree_sorted_a_z(tags)).toBe(false);

    const entries = sort_tag_tree_a_z(tags);
    const sorted = apply_tag_orders(
      tags,
      new Map(entries.map((e) => [e.id, e.sort_order])),
    );

    expect(is_tag_tree_sorted_a_z(sorted)).toBe(true);
    expect(get_sibling_tags(sorted, "id-home").map((t) => t.name)).toEqual([
      "bills",
      "home",
      "work",
    ]);
    expect(get_sibling_tags(sorted, "id-zeta").map((t) => t.name)).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(sort_tag_tree_a_z(sorted)).toEqual([]);
  });
});
