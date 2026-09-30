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
  COMPOSE_CARET_BLOCK,
  format_signature_html,
  insert_signature_node,
  with_caret_block,
} from "./signature_html";

const plain_signature = {
  id: "sig_1",
  content: "Cheers,\nThe Aster Team",
  is_html: false,
};

function make_node(html: string): Element {
  const wrapper = document.createElement("div");

  wrapper.innerHTML = html;

  return wrapper.firstElementChild as Element;
}

describe("format_signature_html", () => {
  it("returns nothing without a signature", () => {
    expect(format_signature_html(null, true)).toBe("");
  });

  it("starts with the signature content, not blank lines", () => {
    expect(format_signature_html(plain_signature, false)).toBe(
      '<div data-aster-signature="1" data-aster-signature-id="sig_1">Cheers,<br>The Aster Team</div>',
    );
  });

  it("puts the separator directly before the content", () => {
    const html = format_signature_html(plain_signature, true);

    expect(html).toContain('data-aster-signature-id="sig_1">--<br>Cheers,');
    expect(html).not.toContain("<br><br>");
  });

  it("escapes plain text signatures", () => {
    expect(
      format_signature_html(
        { id: "s", content: "<b>&", is_html: false },
        false,
      ),
    ).toContain(">&lt;b&gt;&amp;</div>");
  });
});

describe("with_caret_block", () => {
  it("adds exactly one caret line above the content", () => {
    const html = with_caret_block(
      format_signature_html(plain_signature, false),
    );

    expect(html.startsWith(COMPOSE_CARET_BLOCK + "<div data-aster")).toBe(true);
  });

  it("leaves empty content empty", () => {
    expect(with_caret_block("")).toBe("");
  });
});

describe("insert_signature_node", () => {
  it("places the signature under an existing empty caret line", () => {
    const editor = document.createElement("div");

    editor.innerHTML = "<div><br></div><div>footer</div>";
    insert_signature_node(
      editor,
      make_node(format_signature_html(plain_signature, false)),
    );

    expect(editor.children[0].outerHTML).toBe("<div><br></div>");
    expect(editor.children[1].getAttribute("data-aster-signature")).toBe("1");
    expect(editor.children[2].textContent).toBe("footer");
  });

  it("adds a caret line when the editor starts with content", () => {
    const editor = document.createElement("div");

    editor.innerHTML = "<div>footer</div>";
    insert_signature_node(
      editor,
      make_node(format_signature_html(plain_signature, false)),
    );

    expect(editor.children[0].outerHTML).toBe("<div><br></div>");
    expect(editor.children[1].getAttribute("data-aster-signature")).toBe("1");
    expect(editor.children.length).toBe(3);
  });

  it("adds a caret line to an empty editor", () => {
    const editor = document.createElement("div");

    insert_signature_node(
      editor,
      make_node(format_signature_html(plain_signature, false)),
    );

    expect(editor.innerHTML).toBe(
      '<div><br></div><div data-aster-signature="1" data-aster-signature-id="sig_1">Cheers,<br>The Aster Team</div>',
    );
  });
});
