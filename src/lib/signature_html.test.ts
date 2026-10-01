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
  format_signature_html,
  insert_signature_node,
  remove_signature_node,
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
