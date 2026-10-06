//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, expect, it } from "vitest";

import {
  MAX_TAG_DEPTH,
  TAG_OPTION_INDENT_PX,
  build_tag_tree,
  flatten_visible_tag_tree,
  get_eligible_parent_tags,
  get_tag_depth,
  get_tag_descendant_tokens,
  get_tag_subtree_height,
  has_sibling_tag_named,
  order_tags_as_tree,
  reparent_children_of_removed_tag,
  tag_option_indent,
  tag_path_label,
  type OrderedTag,
  type TagTreeItem,
} from "@/hooks/tag_tree";
import {
  MAX_INDENT_DEPTH,
  indent_depth,
  indent_guide_trail,
} from "@/hooks/tree_indent";

function make_tag(
  name: string,
  sort_order: number,
  parent?: string,
  extra: Partial<TagTreeItem> = {},
): TagTreeItem {
  return {
    id: `id-${name}`,
    tag_token: `token-${name}`,
    name,
    sort_order,
    created_at: "2026-01-01T00:00:00Z",
    parent_token: parent ? `token-${parent}` : undefined,
    ...extra,
  };
}

function summarize(entries: OrderedTag[]): string[] {
  return entries.map((entry) => `${entry.tag.name}:${entry.depth}`);
}

function make_chain(length: number): TagTreeItem[] {
  return Array.from({ length }, (_, index) =>
    make_tag(`level${index}`, 0, index > 0 ? `level${index - 1}` : undefined),
  );
}

const sample_tags: TagTreeItem[] = [
  make_tag("flights", 0, "travel"),
  make_tag("travel", 1),
  make_tag("receipts", 1, "work"),
  make_tag("work", 0),
  make_tag("invoices", 0, "work"),
  make_tag("y2026", 0, "invoices"),
];

describe("order_tags_as_tree", () => {
  it("places every sublabel under its parent in sibling order", () => {
    expect(summarize(order_tags_as_tree(sample_tags))).toEqual([
      "work:0",
      "invoices:1",
      "y2026:2",
      "receipts:1",
      "travel:0",
      "flights:1",
    ]);
  });

  it("keeps a flat list flat", () => {
    const tags = [make_tag("b", 1), make_tag("a", 0), make_tag("c", 2)];

    expect(summarize(order_tags_as_tree(tags))).toEqual(["a:0", "b:0", "c:0"]);
  });

  it("shows a label whose parent is missing at the top level", () => {
    const tags = [make_tag("work", 0), make_tag("orphan", 1, "deleted")];

    expect(summarize(order_tags_as_tree(tags))).toEqual(["work:0", "orphan:0"]);
  });

  it("shows a label that names itself as parent at the top level", () => {
    const tags = [make_tag("loop", 0, "loop")];

    expect(summarize(order_tags_as_tree(tags))).toEqual(["loop:0"]);
  });

  it("keeps both members of a parent cycle visible exactly once", () => {
    const tags = [
      make_tag("work", 0),
      make_tag("a", 1, "b"),
      make_tag("b", 2, "a"),
    ];
    const ordered = summarize(order_tags_as_tree(tags));

    expect(ordered).toHaveLength(3);
    expect(ordered).toContain("work:0");
    expect(ordered).toContain("a:0");
    expect(ordered).toContain("b:0");
  });

  it("keeps an unreadable label at its position with its sublabels", () => {
    const tags = [
      make_tag("work", 0),
      make_tag("unreadable", 1, undefined, { is_undecryptable: true }),
      make_tag("child", 0, "unreadable"),
      make_tag("travel", 2),
    ];

    expect(summarize(order_tags_as_tree(tags))).toEqual([
      "work:0",
      "unreadable:0",
      "child:1",
      "travel:0",
    ]);
  });

  it("never renders deeper than the depth limit and drops nothing", () => {
    const ordered = summarize(order_tags_as_tree(make_chain(11)));

    expect(ordered).toEqual([
      "level0:0",
      "level1:1",
      "level2:2",
      "level3:3",
      "level4:4",
      "level5:5",
      "level6:6",
      "level7:7",
      "level8:8",
      "level9:9",
      "level10:0",
    ]);
  });

  it("allows ten levels", () => {
    expect(MAX_TAG_DEPTH + 1).toBe(10);
  });
});

describe("flatten_visible_tag_tree", () => {
  it("hides the sublabels of collapsed labels only", () => {
    const tree = build_tag_tree(sample_tags);
    const visible = flatten_visible_tag_tree(tree, new Set(["token-work"]));

    expect(summarize(visible)).toEqual([
      "work:0",
      "invoices:1",
      "receipts:1",
      "travel:0",
    ]);
  });

  it("shows only top-level labels when nothing is expanded", () => {
    const tree = build_tag_tree(sample_tags);

    expect(summarize(flatten_visible_tag_tree(tree, new Set()))).toEqual([
      "work:0",
      "travel:0",
    ]);
  });
});

describe("get_eligible_parent_tags", () => {
  it("offers every label when creating a new one", () => {
    expect(summarize(get_eligible_parent_tags(sample_tags))).toEqual([
      "work:0",
      "invoices:1",
      "y2026:2",
      "receipts:1",
      "travel:0",
      "flights:1",
    ]);
  });

  it("excludes the moving label and all of its descendants", () => {
    const names = get_eligible_parent_tags(sample_tags, "id-work").map(
      (entry) => entry.tag.name,
    );

    expect(names).toEqual(["travel", "flights"]);
  });

  it("excludes only the subtree when moving a nested label", () => {
    const names = get_eligible_parent_tags(sample_tags, "id-invoices").map(
      (entry) => entry.tag.name,
    );

    expect(names).toEqual(["work", "receipts", "travel", "flights"]);
  });

  it("excludes unreadable labels", () => {
    const tags = [
      make_tag("work", 0),
      make_tag("unreadable", 1, undefined, { is_undecryptable: true }),
    ];
    const names = get_eligible_parent_tags(tags).map((entry) => entry.tag.name);

    expect(names).toEqual(["work"]);
  });

  it("excludes parents that would push a new label past the limit", () => {
    const names = get_eligible_parent_tags(make_chain(10)).map(
      (entry) => entry.tag.name,
    );

    expect(names).toEqual([
      "level0",
      "level1",
      "level2",
      "level3",
      "level4",
      "level5",
      "level6",
      "level7",
      "level8",
    ]);
  });

  it("accounts for the height of the moving subtree", () => {
    const tags = [
      ...make_chain(10),
      make_tag("moving", 1),
      make_tag("moving_child", 0, "moving"),
    ];
    const names = get_eligible_parent_tags(tags, "id-moving").map(
      (entry) => entry.tag.name,
    );

    expect(names).toEqual([
      "level0",
      "level1",
      "level2",
      "level3",
      "level4",
      "level5",
      "level6",
      "level7",
    ]);
  });

  it("does not loop forever when the stored parents form a cycle", () => {
    const tags = [
      make_tag("a", 0, "b"),
      make_tag("b", 1, "a"),
      make_tag("c", 2),
    ];
    const names = get_eligible_parent_tags(tags, "id-a").map(
      (entry) => entry.tag.name,
    );

    expect(names).toEqual(["c"]);
  });
});

describe("tag depth helpers", () => {
  it("collects descendants at every level", () => {
    expect(
      [...get_tag_descendant_tokens(sample_tags, "token-work")].sort(),
    ).toEqual(["token-invoices", "token-receipts", "token-y2026"]);
    expect(get_tag_descendant_tokens(sample_tags, "token-flights").size).toBe(
      0,
    );
  });

  it("measures depth and subtree height", () => {
    expect(get_tag_depth(sample_tags, "token-work")).toBe(0);
    expect(get_tag_depth(sample_tags, "token-y2026")).toBe(2);
    expect(get_tag_subtree_height(sample_tags, "token-work")).toBe(2);
    expect(get_tag_subtree_height(sample_tags, "token-invoices")).toBe(1);
    expect(get_tag_subtree_height(sample_tags, "token-y2026")).toBe(0);
  });
});

describe("has_sibling_tag_named", () => {
  it("matches only labels that share the same parent", () => {
    expect(has_sibling_tag_named(sample_tags, "invoices", "token-work")).toBe(
      true,
    );
    expect(has_sibling_tag_named(sample_tags, "invoices", undefined)).toBe(
      false,
    );
    expect(has_sibling_tag_named(sample_tags, "invoices", "token-travel")).toBe(
      false,
    );
  });

  it("ignores case and surrounding spaces", () => {
    expect(has_sibling_tag_named(sample_tags, "  WORK ", undefined)).toBe(true);
    expect(has_sibling_tag_named(sample_tags, "  WORK ", "")).toBe(true);
  });

  it("skips the label being edited", () => {
    expect(
      has_sibling_tag_named(sample_tags, "work", undefined, "id-work"),
    ).toBe(false);
  });

  it("skips unreadable labels", () => {
    const tags = [
      make_tag("placeholder", 0, undefined, { is_undecryptable: true }),
    ];

    expect(has_sibling_tag_named(tags, "placeholder", undefined)).toBe(false);
  });

  it("treats a label with a missing parent as top level", () => {
    const tags = [make_tag("orphan", 0, "deleted")];

    expect(has_sibling_tag_named(tags, "orphan", undefined)).toBe(true);
  });
});

describe("reparent_children_of_removed_tag", () => {
  it("moves sublabels up to the parent of the removed label", () => {
    const result = reparent_children_of_removed_tag(sample_tags, "id-invoices");

    expect(result.map((tag) => tag.name)).not.toContain("invoices");
    expect(result.find((tag) => tag.name === "y2026")?.parent_token).toBe(
      "token-work",
    );
    expect(result.find((tag) => tag.name === "receipts")?.parent_token).toBe(
      "token-work",
    );
  });

  it("moves sublabels to the top level when a top-level label is removed", () => {
    const result = reparent_children_of_removed_tag(sample_tags, "id-work");

    expect(
      result.find((tag) => tag.name === "invoices")?.parent_token,
    ).toBeUndefined();
    expect(
      result.find((tag) => tag.name === "receipts")?.parent_token,
    ).toBeUndefined();
    expect(result.find((tag) => tag.name === "y2026")?.parent_token).toBe(
      "token-invoices",
    );
    expect(summarize(order_tags_as_tree(result))).toEqual([
      "invoices:0",
      "y2026:1",
      "receipts:0",
      "travel:0",
      "flights:1",
    ]);
  });

  it("returns the same list when the label is unknown", () => {
    expect(reparent_children_of_removed_tag(sample_tags, "id-missing")).toBe(
      sample_tags,
    );
  });
});

describe("tag_path_label", () => {
  it("joins the names from the top-level label down", () => {
    expect(tag_path_label(sample_tags, "token-y2026")).toBe(
      "work / invoices / y2026",
    );
    expect(tag_path_label(sample_tags, "token-work")).toBe("work");
    expect(tag_path_label(sample_tags, "token-flights", " > ")).toBe(
      "travel > flights",
    );
  });

  it("stops at a missing parent or a cycle", () => {
    const tags = [
      make_tag("orphan", 0, "deleted"),
      make_tag("a", 1, "b"),
      make_tag("b", 2, "a"),
    ];

    expect(tag_path_label(tags, "token-orphan")).toBe("orphan");
    expect(tag_path_label(tags, "token-a")).toBe("b / a");
    expect(tag_path_label(tags, "token-missing")).toBe("");
  });
});

describe("tag_option_indent", () => {
  it("indents one step per level and never goes negative", () => {
    expect(tag_option_indent(0)).toBe(0);
    expect(tag_option_indent(undefined)).toBe(0);
    expect(tag_option_indent(2)).toBe(2 * TAG_OPTION_INDENT_PX);
    expect(tag_option_indent(-3)).toBe(0);
  });

  it("stops indenting past the visual cap so deep rows stay readable", () => {
    expect(tag_option_indent(MAX_INDENT_DEPTH)).toBe(
      MAX_INDENT_DEPTH * TAG_OPTION_INDENT_PX,
    );
    expect(tag_option_indent(MAX_TAG_DEPTH)).toBe(
      MAX_INDENT_DEPTH * TAG_OPTION_INDENT_PX,
    );
  });
});

describe("tree indent helpers", () => {
  it("clamps the depth used for layout", () => {
    expect(indent_depth(undefined)).toBe(0);
    expect(indent_depth(-2)).toBe(0);
    expect(indent_depth(3)).toBe(3);
    expect(indent_depth(MAX_INDENT_DEPTH + 3)).toBe(MAX_INDENT_DEPTH);
  });

  it("keeps the nearest ancestors when a guide trail is longer than the cap", () => {
    const trail = [true, false, true, false, true, false, true, true, false];

    expect(indent_guide_trail(undefined, 4)).toBeUndefined();
    expect(indent_guide_trail([true, false], 2)).toEqual([true, false]);
    expect(indent_guide_trail(trail, trail.length)).toEqual(
      trail.slice(trail.length - MAX_INDENT_DEPTH),
    );
  });
});
