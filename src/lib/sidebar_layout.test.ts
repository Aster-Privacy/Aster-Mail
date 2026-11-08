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

import {
  DEFAULT_SIDEBAR_SECTION_ORDER,
  MAX_SIDEBAR_LAYOUT_IDS,
  can_move_sidebar_section,
  is_default_sidebar_layout,
  is_sidebar_item_hidden,
  move_sidebar_section,
  resolve_sidebar_section_order,
  sanitize_sidebar_hidden_items,
  sanitize_sidebar_section_order,
  set_sidebar_item_hidden,
} from "./sidebar_layout";

describe("sanitize_sidebar_section_order", () => {
  it("returns the default order for missing or malformed values", () => {
    expect(sanitize_sidebar_section_order(undefined)).toEqual(
      DEFAULT_SIDEBAR_SECTION_ORDER,
    );
    expect(sanitize_sidebar_section_order(null)).toEqual(
      DEFAULT_SIDEBAR_SECTION_ORDER,
    );
    expect(sanitize_sidebar_section_order("mail,folders")).toEqual(
      DEFAULT_SIDEBAR_SECTION_ORDER,
    );
    expect(sanitize_sidebar_section_order({ 0: "aliases" })).toEqual(
      DEFAULT_SIDEBAR_SECTION_ORDER,
    );
  });

  it("keeps the saved order and appends sections that are missing", () => {
    expect(sanitize_sidebar_section_order(["aliases", "mail"])).toEqual([
      "aliases",
      "mail",
      "folders",
      "labels",
    ]);
  });

  it("drops duplicates, non-strings, and ids with unsafe characters", () => {
    expect(
      sanitize_sidebar_section_order([
        "labels",
        "labels",
        7,
        null,
        "<script>",
        "Mail",
        "",
        "a".repeat(40),
        "folders",
      ]),
    ).toEqual(["labels", "folders", "mail", "aliases"]);
  });

  it("keeps unknown well-formed ids so newer clients do not lose them", () => {
    expect(
      sanitize_sidebar_section_order(["calendar", "labels", "mail"]),
    ).toEqual(["calendar", "labels", "mail", "folders", "aliases"]);
  });

  it("caps the number of stored ids", () => {
    const many = Array.from({ length: 100 }, (_, i) => `section_${i}`);
    const result = sanitize_sidebar_section_order(many);

    expect(result.length).toBe(MAX_SIDEBAR_LAYOUT_IDS + 4);
    expect(result.slice(-4)).toEqual(DEFAULT_SIDEBAR_SECTION_ORDER);
  });
});

describe("resolve_sidebar_section_order", () => {
  it("returns only known sections, each exactly once", () => {
    expect(
      resolve_sidebar_section_order(["calendar", "aliases", "aliases"]),
    ).toEqual(["aliases", "mail", "folders", "labels"]);
  });
});

describe("move_sidebar_section", () => {
  it("moves a section up and down", () => {
    expect(move_sidebar_section(undefined, "labels", -1)).toEqual([
      "mail",
      "labels",
      "folders",
      "aliases",
    ]);
    expect(move_sidebar_section(undefined, "mail", 1)).toEqual([
      "folders",
      "mail",
      "labels",
      "aliases",
    ]);
  });

  it("does nothing at the edges or for unknown ids", () => {
    expect(move_sidebar_section(undefined, "mail", -1)).toEqual(
      DEFAULT_SIDEBAR_SECTION_ORDER,
    );
    expect(move_sidebar_section(undefined, "aliases", 1)).toEqual(
      DEFAULT_SIDEBAR_SECTION_ORDER,
    );
    expect(move_sidebar_section(undefined, "calendar", 1)).toEqual(
      DEFAULT_SIDEBAR_SECTION_ORDER,
    );
  });

  it("skips over unknown ids and keeps them in place", () => {
    expect(
      move_sidebar_section(["mail", "calendar", "folders"], "folders", -1),
    ).toEqual(["folders", "calendar", "mail", "labels", "aliases"]);
  });

  it("does not move a section past an unknown id at the edge", () => {
    expect(move_sidebar_section(["calendar", "mail"], "mail", -1)).toEqual([
      "calendar",
      "mail",
      "folders",
      "labels",
      "aliases",
    ]);
  });
});

describe("can_move_sidebar_section", () => {
  it("reports whether a move is possible", () => {
    expect(can_move_sidebar_section(undefined, "mail", -1)).toBe(false);
    expect(can_move_sidebar_section(undefined, "mail", 1)).toBe(true);
    expect(can_move_sidebar_section(undefined, "aliases", 1)).toBe(false);
    expect(can_move_sidebar_section(["calendar", "mail"], "mail", -1)).toBe(
      false,
    );
    expect(can_move_sidebar_section(undefined, "calendar", 1)).toBe(false);
  });
});

describe("sidebar hidden items", () => {
  it("sanitizes the hidden list", () => {
    expect(sanitize_sidebar_hidden_items("trash")).toEqual([]);
    expect(
      sanitize_sidebar_hidden_items(["trash", "trash", 1, "Spam", "spam"]),
    ).toEqual(["trash", "spam"]);
  });

  it("never treats inbox or the mail section as hidden", () => {
    expect(is_sidebar_item_hidden(["inbox", "mail"], "inbox")).toBe(false);
    expect(is_sidebar_item_hidden(["inbox", "mail"], "mail")).toBe(false);
    expect(is_sidebar_item_hidden(["trash"], "trash")).toBe(true);
    expect(is_sidebar_item_hidden(undefined, "trash")).toBe(false);
  });

  it("hides and shows items without duplicates", () => {
    const hidden = set_sidebar_item_hidden([], "spam", true);

    expect(hidden).toEqual(["spam"]);
    expect(set_sidebar_item_hidden(hidden, "spam", true)).toEqual(["spam"]);
    expect(set_sidebar_item_hidden(hidden, "spam", false)).toEqual([]);
  });

  it("refuses to hide items that cannot be hidden", () => {
    expect(set_sidebar_item_hidden([], "inbox", true)).toEqual([]);
    expect(set_sidebar_item_hidden([], "mail", true)).toEqual([]);
    expect(set_sidebar_item_hidden([], "unknown_item", true)).toEqual([]);
  });

  it("keeps unknown ids from newer clients when toggling", () => {
    expect(set_sidebar_item_hidden(["future_item"], "trash", true)).toEqual([
      "future_item",
      "trash",
    ]);
    expect(
      set_sidebar_item_hidden(["future_item", "trash"], "trash", false),
    ).toEqual(["future_item"]);
  });

  it("does not grow past the cap", () => {
    const full = Array.from(
      { length: MAX_SIDEBAR_LAYOUT_IDS },
      (_, i) => `item_${i}`,
    );

    expect(set_sidebar_item_hidden(full, "trash", true)).toEqual(full);
  });
});

describe("is_default_sidebar_layout", () => {
  it("detects the default layout", () => {
    expect(is_default_sidebar_layout(undefined, undefined)).toBe(true);
    expect(is_default_sidebar_layout(["calendar"], ["future_item"])).toBe(true);
    expect(is_default_sidebar_layout(["labels"], [])).toBe(false);
    expect(is_default_sidebar_layout(undefined, ["trash"])).toBe(false);
  });
});
