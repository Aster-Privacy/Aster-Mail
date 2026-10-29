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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { toggle_inline_format } from "@/hooks/editor_inline_toggle";

function select_contents(node: Node) {
  const range = document.createRange();

  range.selectNodeContents(node);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
}

function place_caret(node: Node, offset: number) {
  const range = document.createRange();

  range.setStart(node, offset);
  range.collapse(true);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
}

describe("toggle_inline_format", () => {
  let editor: HTMLDivElement;
  let bold_active: boolean;

  beforeEach(() => {
    editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.appendChild(editor);
    bold_active = true;
    Object.assign(document, {
      queryCommandState: vi.fn(() => bold_active),
      execCommand: vi.fn(() => true),
    });
  });

  afterEach(() => {
    editor.remove();
  });

  it("leaves the result alone when the command turns bold off", () => {
    editor.innerHTML = "<b>hello</b>";
    select_contents(editor.firstChild!);
    vi.mocked(document.execCommand).mockImplementation(() => {
      bold_active = false;

      return true;
    });

    toggle_inline_format(editor, "bold");

    expect(editor.innerHTML).toBe("<b>hello</b>");
  });

  it("unbolds a selection when the command leaves it bold", () => {
    editor.innerHTML = "<div><b>hello</b> world</div>";
    select_contents(editor.querySelector("b")!);

    toggle_inline_format(editor, "bold");

    const span = editor.querySelector("span")!;

    expect(span.style.fontWeight).toBe("normal");
    expect(span.textContent).toBe("hello");
    expect(span.querySelector("b")).toBeNull();
    expect(editor.textContent).toBe("hello world");
  });

  it("starts normal-weight typing at a caret the command leaves bold", () => {
    editor.innerHTML = "<b>hello</b>";
    place_caret(editor.querySelector("b")!.firstChild!, 5);

    toggle_inline_format(editor, "bold");

    const span = editor.querySelector("span")!;

    expect(span.style.fontWeight).toBe("normal");
    expect(span.textContent).toBe("​");
    expect(window.getSelection()!.anchorNode).toBe(span.firstChild);
  });

  it("does not force anything when bold was off", () => {
    bold_active = false;
    editor.innerHTML = "hello";
    select_contents(editor);

    toggle_inline_format(editor, "bold");

    expect(editor.innerHTML).toBe("hello");
  });
});
