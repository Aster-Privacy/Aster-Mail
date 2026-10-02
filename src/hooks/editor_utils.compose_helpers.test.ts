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
  encode_link_url,
  get_selection_anchor,
  pasted_html_has_text,
  strip_editor_fillers,
} from "./editor_utils";

describe("strip_editor_fillers", () => {
  it("removes zero width spaces left by link break-out", () => {
    expect(strip_editor_fillers('<a href="x">a</a>​b​')).toBe(
      '<a href="x">a</a>b',
    );
  });
});

describe("pasted_html_has_text", () => {
  it("is true for markup that carries words", () => {
    expect(pasted_html_has_text("<p>Hello <b>there</b></p>")).toBe(true);
  });

  it("is false for a lone image or whitespace", () => {
    expect(pasted_html_has_text('<img src="data:image/png;base64,AA">')).toBe(
      false,
    );
    expect(pasted_html_has_text("<p>&nbsp; </p>")).toBe(false);
    expect(pasted_html_has_text("")).toBe(false);
  });
});

describe("encode_link_url", () => {
  it("encodes spaces and quotes", () => {
    expect(encode_link_url('https://a.example/p q"r')).toBe(
      "https://a.example/p%20q%22r",
    );
  });

  it("does not double encode an already encoded url", () => {
    expect(encode_link_url("https://a.example/p%20q?x=%26")).toBe(
      "https://a.example/p%20q?x=%26",
    );
  });

  it("returns null instead of throwing on a lone surrogate", () => {
    expect(encode_link_url("https://a.example/\ud800")).toBeNull();
  });
});

describe("get_selection_anchor", () => {
  const select = (node: Node, offset: number, end?: Node) => {
    const range = document.createRange();

    range.setStart(node, offset);
    if (end) {
      range.setEnd(end, 0);
    } else {
      range.collapse(true);
    }
    const selection = window.getSelection();

    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  it("finds the link around a collapsed caret", () => {
    const editor = document.createElement("div");

    editor.innerHTML = '<p>see <a href="https://x.example">here</a> now</p>';
    document.body.appendChild(editor);
    const anchor = editor.querySelector("a")!;

    select(anchor.firstChild!, 2);
    expect(get_selection_anchor(editor)).toBe(anchor);
    editor.remove();
  });

  it("returns null when the selection leaves the link", () => {
    const editor = document.createElement("div");

    editor.innerHTML = '<p>see <a href="https://x.example">here</a> now</p>';
    document.body.appendChild(editor);
    const anchor = editor.querySelector("a")!;

    select(anchor.firstChild!, 1, anchor.nextSibling!);
    expect(get_selection_anchor(editor)).toBeNull();
    editor.remove();
  });

  it("returns null outside any link", () => {
    const editor = document.createElement("div");

    editor.innerHTML = "<p>plain</p>";
    document.body.appendChild(editor);
    select(editor.querySelector("p")!.firstChild!, 1);
    expect(get_selection_anchor(editor)).toBeNull();
    editor.remove();
  });
});
