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
  SIGNATURE_GAP_BLOCK,
  append_signature_node,
  append_template_after_typed_text,
  format_signature_html,
  has_typed_content,
  insert_signature_node,
  remove_signature_node,
  signature_from_editor_html,
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

const signature_markup = format_signature_html(plain_signature, false);

describe("with_caret_block", () => {
  it("puts a caret line and one blank line above the signature", () => {
    expect(with_caret_block(signature_markup)).toBe(
      COMPOSE_CARET_BLOCK + SIGNATURE_GAP_BLOCK + signature_markup,
    );
  });

  it("uses a styled caret line when one is given", () => {
    const styled = '<div style="color: red"><br></div>';

    expect(with_caret_block(signature_markup, styled)).toBe(
      styled + SIGNATURE_GAP_BLOCK + signature_markup,
    );
  });

  it("adds no blank line when the content is not a signature", () => {
    expect(with_caret_block("<span>badge</span>")).toBe(
      COMPOSE_CARET_BLOCK + "<span>badge</span>",
    );
  });

  it("leaves empty content empty", () => {
    expect(with_caret_block("")).toBe("");
  });
});

describe("insert_signature_node", () => {
  it("adds one blank line under an existing empty caret line", () => {
    const editor = document.createElement("div");

    editor.innerHTML = "<div><br></div><div>footer</div>";
    insert_signature_node(editor, make_node(signature_markup));

    expect(editor.innerHTML).toBe(
      "<div><br></div><div><br></div>" + signature_markup + "<div>footer</div>",
    );
  });

  it("reuses an existing blank line instead of adding another", () => {
    const editor = document.createElement("div");

    editor.innerHTML = "<div><br></div><div><br></div><div>footer</div>";
    insert_signature_node(editor, make_node(signature_markup));

    expect(editor.innerHTML).toBe(
      "<div><br></div><div><br></div>" + signature_markup + "<div>footer</div>",
    );
  });

  it("adds a caret line and a blank line when the editor starts with content", () => {
    const editor = document.createElement("div");

    editor.innerHTML = "<div>footer</div>";
    insert_signature_node(editor, make_node(signature_markup));

    expect(editor.innerHTML).toBe(
      "<div><br></div><div><br></div>" + signature_markup + "<div>footer</div>",
    );
  });

  it("does not treat a bare line break as the caret line", () => {
    const editor = document.createElement("div");

    editor.innerHTML = "<div><br></div><br><br>Secured";
    insert_signature_node(editor, make_node(signature_markup));

    expect(editor.innerHTML).toBe(
      "<div><br></div><div><br></div>" + signature_markup + "<br><br>Secured",
    );
  });

  it("matches the seeded layout in an empty editor", () => {
    const editor = document.createElement("div");

    insert_signature_node(editor, make_node(signature_markup));

    expect(editor.innerHTML).toBe(with_caret_block(signature_markup));
  });
});

describe("append_signature_node", () => {
  it("adds one blank line between typed text and the signature", () => {
    const editor = document.createElement("div");

    editor.innerHTML = "<div>Hello</div>";
    append_signature_node(editor, make_node(signature_markup));

    expect(editor.innerHTML).toBe(
      "<div>Hello</div>" + SIGNATURE_GAP_BLOCK + signature_markup,
    );
  });

  it("reuses a trailing blank line", () => {
    const editor = document.createElement("div");

    editor.innerHTML = "<div>Hello</div><div><br></div>";
    append_signature_node(editor, make_node(signature_markup));

    expect(editor.innerHTML).toBe(
      "<div>Hello</div>" + SIGNATURE_GAP_BLOCK + signature_markup,
    );
  });

  it("uses the seeded layout when nothing was typed", () => {
    const editor = document.createElement("div");

    editor.innerHTML = "<div><br></div>";
    append_signature_node(editor, make_node(signature_markup));

    expect(editor.innerHTML).toBe(with_caret_block(signature_markup));
  });
});

describe("remove_signature_node", () => {
  it("removes the signature and its blank line", () => {
    const editor = document.createElement("div");

    editor.innerHTML = with_caret_block(signature_markup);
    remove_signature_node(editor.querySelector("[data-aster-signature]")!);

    expect(editor.innerHTML).toBe(COMPOSE_CARET_BLOCK);
  });

  it("keeps the caret line when there is no blank line", () => {
    const editor = document.createElement("div");

    editor.innerHTML = COMPOSE_CARET_BLOCK + signature_markup;
    remove_signature_node(editor.querySelector("[data-aster-signature]")!);

    expect(editor.innerHTML).toBe(COMPOSE_CARET_BLOCK);
  });

  it("does not add blank lines across repeated switches", () => {
    const editor = document.createElement("div");

    editor.innerHTML = with_caret_block(signature_markup);

    for (let i = 0; i < 3; i++) {
      remove_signature_node(editor.querySelector("[data-aster-signature]")!);
      append_signature_node(editor, make_node(signature_markup));
    }

    expect(editor.innerHTML).toBe(with_caret_block(signature_markup));
  });
});

describe("has_typed_content", () => {
  it("treats blank lines as nothing typed", () => {
    const editor = document.createElement("div");

    editor.innerHTML = "<br><div><br></div><div> </div>";

    expect(has_typed_content(editor)).toBe(false);
    expect(has_typed_content(null)).toBe(false);
  });

  it("counts typed text and pasted images", () => {
    const editor = document.createElement("div");

    editor.textContent = "Hello";
    expect(has_typed_content(editor)).toBe(true);

    editor.innerHTML = '<div><img src="data:image/png;base64,AA=="></div>';
    expect(has_typed_content(editor)).toBe(true);
  });
});

describe("append_template_after_typed_text", () => {
  it("adds the template below the typed text, without its caret line", () => {
    const editor = document.createElement("div");

    editor.textContent = "Hello";
    const typed = editor.firstChild;

    append_template_after_typed_text(
      editor,
      with_caret_block(signature_markup) + "<br><br>Secured",
    );

    expect(editor.innerHTML).toBe(
      "Hello" + SIGNATURE_GAP_BLOCK + signature_markup + "<br><br>Secured",
    );
    expect(editor.firstChild).toBe(typed);
  });

  it("leaves the typed text alone when the template is empty", () => {
    const editor = document.createElement("div");

    editor.innerHTML = "<div>Hello</div>";
    append_template_after_typed_text(editor, "");

    expect(editor.innerHTML).toBe("<div>Hello</div>");
  });
});

describe("signature_from_editor_html", () => {
  it.each([
    ["bullet list", "<ul><li>Tel: 555 0100</li><li>1 Example Street</li></ul>"],
    ["numbered list", "<ol><li>First</li><li>Second</li></ol>"],
    ["strike", "<div><strike>Old title</strike></div>"],
    ["s", "Jane <s>Doe</s>"],
    ["del", "Jane <del>Doe</del>"],
    ["font", '<font color="#ff0000">Jane</font>'],
    ["font size", '<font size="5">Jane</font>'],
    ["align attribute", '<div align="center">Jane</div>'],
    ["inline alignment", '<div style="text-align: center;">Jane</div>'],
    ["center", "<center>Jane</center>"],
    ["blockquote", "<blockquote>Jane</blockquote>"],
    ["heading", "<h2>Jane Doe</h2>"],
    ["pre", "<pre>Jane</pre>"],
    ["code", "Jane <code>Doe</code>"],
    ["sub", "H<sub>2</sub>O"],
    ["sup", "x<sup>2</sup>"],
    ["bold", "<b>Jane</b>"],
    ["link", '<a href="https://example.com">Example</a>'],
  ])("keeps %s formatting as HTML", (_label, html) => {
    expect(signature_from_editor_html(`  ${html}  `)).toEqual({
      content: html,
      is_html: true,
    });
  });

  it.each([
    ["typed text", "Jane Doe", "Jane Doe"],
    ["Enter divs", "Jane Doe<div>Example Inc.</div>", "Jane Doe\nExample Inc."],
    ["trailing empty line", "<div>Jane Doe</div><div><br></div>", "Jane Doe"],
    ["br lines", "Jane Doe<br>Example Inc.", "Jane Doe\nExample Inc."],
    [
      "paragraphs",
      "<p>Jane Doe</p><p>Example Inc.</p>",
      "Jane Doe\nExample Inc.",
    ],
    ["unstyled span", "<span>Jane Doe</span>", "Jane Doe"],
    [
      "blank lines",
      "<div>Jane</div><div><br></div><div><br></div><div><br></div><div>Doe</div>",
      "Jane\n\nDoe",
    ],
  ])("keeps %s as plain text", (_label, html, expected) => {
    expect(signature_from_editor_html(html)).toEqual({
      content: expected,
      is_html: false,
    });
  });
});
