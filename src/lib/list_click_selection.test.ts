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
  apply_range_selection,
  list_click_intent,
  plan_range_selection,
} from "./list_click_selection";

const plain = { ctrlKey: false, metaKey: false, shiftKey: false, button: 0 };
const ids = ["a", "b", "c", "d", "e", "f"];

describe("list_click_intent", () => {
  it("opens on a plain click", () => {
    expect(list_click_intent(plain, false)).toBeNull();
    expect(list_click_intent(plain, true)).toBeNull();
  });

  it("toggles with Ctrl outside macOS", () => {
    expect(list_click_intent({ ...plain, ctrlKey: true }, false)).toBe(
      "toggle",
    );
    expect(list_click_intent({ ...plain, metaKey: true }, false)).toBeNull();
  });

  it("toggles with Command on macOS", () => {
    expect(list_click_intent({ ...plain, metaKey: true }, true)).toBe("toggle");
    expect(list_click_intent({ ...plain, ctrlKey: true }, true)).toBeNull();
  });

  it("selects a range with Shift, even with Ctrl held", () => {
    expect(list_click_intent({ ...plain, shiftKey: true }, false)).toBe(
      "range",
    );
    expect(
      list_click_intent({ ...plain, shiftKey: true, ctrlKey: true }, false),
    ).toBe("range");
  });

  it("ignores buttons other than the primary one", () => {
    expect(
      list_click_intent({ ...plain, ctrlKey: true, button: 1 }, false),
    ).toBeNull();
    expect(
      list_click_intent({ ...plain, shiftKey: true, button: 2 }, false),
    ).toBeNull();
  });
});

describe("plan_range_selection", () => {
  it("selects every row between the anchor and the target", () => {
    const changes = plan_range_selection({
      ids,
      selected_ids: new Set(["b"]),
      anchor_id: "b",
      target_id: "e",
      previous_target_id: null,
      should_select: true,
    });

    expect(changes).toEqual([
      { id: "c", selected: true },
      { id: "d", selected: true },
      { id: "e", selected: true },
    ]);
  });

  it("works upward from the anchor", () => {
    const changes = plan_range_selection({
      ids,
      selected_ids: new Set(),
      anchor_id: "d",
      target_id: "b",
      previous_target_id: null,
      should_select: true,
    });

    expect(changes?.map((c) => c.id)).toEqual(["b", "c", "d"]);
  });

  it("shrinks the previous range when the target moves back", () => {
    const selected_ids = new Set(["b", "c", "d", "e"]);
    const changes = plan_range_selection({
      ids,
      selected_ids,
      anchor_id: "b",
      target_id: "c",
      previous_target_id: "e",
      should_select: true,
    })!;

    expect(changes).toEqual([
      { id: "d", selected: false },
      { id: "e", selected: false },
    ]);
    expect([...apply_range_selection(selected_ids, changes)].sort()).toEqual([
      "b",
      "c",
    ]);
  });

  it("deselects a range when the anchor was deselected", () => {
    const changes = plan_range_selection({
      ids,
      selected_ids: new Set(["a", "b", "c", "d"]),
      anchor_id: "b",
      target_id: "d",
      previous_target_id: null,
      should_select: false,
    });

    expect(changes).toEqual([
      { id: "b", selected: false },
      { id: "c", selected: false },
      { id: "d", selected: false },
    ]);
  });

  it("returns null when the anchor is no longer listed", () => {
    expect(
      plan_range_selection({
        ids,
        selected_ids: new Set(),
        anchor_id: "z",
        target_id: "c",
        previous_target_id: null,
        should_select: true,
      }),
    ).toBeNull();
  });
});

describe("apply_range_selection", () => {
  it("toggles one row on and off", () => {
    const on = apply_range_selection(new Set(), [{ id: "a", selected: true }]);

    expect(on.has("a")).toBe(true);
    expect(
      apply_range_selection(on, [{ id: "a", selected: false }]).has("a"),
    ).toBe(false);
  });
});
