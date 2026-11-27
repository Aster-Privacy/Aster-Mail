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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { should_place_caret_at_end } from "@/lib/editor_caret_click";

describe("should_place_caret_at_end", () => {
  let container: HTMLDivElement;
  let editor: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.textContent = "First line of the message and a second sentence.";
    container.appendChild(editor);
    document.body.appendChild(container);
    window.getSelection()?.removeAllRanges();
  });

  afterEach(() => {
    container.remove();
  });

  function select_inside_editor(): Selection {
    const selection = window.getSelection() as Selection;
    const range = document.createRange();
    const text = editor.firstChild as Text;

    range.setStart(text, 6);
    range.setEnd(text, 20);
    selection.removeAllRanges();
    selection.addRange(range);

    return selection;
  }

  it("places the caret when the press and the click both land on the empty area", () => {
    expect(
      should_place_caret_at_end({
        container,
        editor,
        press_target: container,
        click_target: container,
        selection: window.getSelection(),
      }),
    ).toBe(true);
  });

  it("keeps a selection dragged out of the editor and released outside it", () => {
    const selection = select_inside_editor();

    expect(
      should_place_caret_at_end({
        container,
        editor,
        press_target: editor.firstChild,
        click_target: container,
        selection,
      }),
    ).toBe(false);
    expect(selection.isCollapsed).toBe(false);
  });

  it("keeps a selection when the press target is unknown", () => {
    expect(
      should_place_caret_at_end({
        container,
        editor,
        press_target: null,
        click_target: container,
        selection: select_inside_editor(),
      }),
    ).toBe(false);
  });

  it("keeps an existing editor selection even if the press started on the empty area", () => {
    expect(
      should_place_caret_at_end({
        container,
        editor,
        press_target: container,
        click_target: container,
        selection: select_inside_editor(),
      }),
    ).toBe(false);
  });

  it("ignores clicks inside the editor", () => {
    expect(
      should_place_caret_at_end({
        container,
        editor,
        press_target: editor,
        click_target: editor,
        selection: window.getSelection(),
      }),
    ).toBe(false);
  });
});
