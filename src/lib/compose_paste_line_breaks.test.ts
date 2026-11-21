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

import { sanitize_compose_paste } from "./html_sanitizer_compose";
import { editor_text_breaks_to_elements } from "./html_source_whitespace";
import { read_compose_editor_html } from "./editable_quoted_html";
import { outgoing_html_to_plain_text } from "./outgoing_plain_text";

import { editor_plain_text } from "@/hooks/editor_utils";

const SUPPORT_LINES = [
  "Hi Adam,",
  "Thanks for the report.",
  "",
  "Best,",
  "Support",
];

const SUPPORT_PLAIN = SUPPORT_LINES.join("\r\n");

const RENDERED_STYLE =
  "color: rgb(0, 0, 0); font-family: &quot;Times New Roman&quot;; font-size: medium; text-indent: 0px; display: inline !important; float: none;";

const paste = (html: string, plain_text?: string) =>
  sanitize_compose_paste(html, {
    collapse_source_whitespace: true,
    plain_text,
  });

const lines_of = (html: string) => {
  const editor = document.createElement("div");

  editor.innerHTML = html;

  return editor_plain_text(editor).split("\n");
};

describe("pasting text that a page shows on separate lines", () => {
  it("keeps the lines of a selection copied without markup", () => {
    const out = paste(SUPPORT_PLAIN, SUPPORT_PLAIN);

    expect(out).not.toMatch(/[\r\n]/);
    expect(lines_of(out)).toEqual(SUPPORT_LINES);
  });

  it("keeps the lines of a paragraph styled by a page stylesheet", () => {
    const out = paste(
      '<p class="body">Hi Adam,\r\nThanks for the <a href="https://example.com/x">report</a>.\r\n\r\nBest,\r\nSupport</p>',
      SUPPORT_PLAIN,
    );

    expect(out).toContain('href="https://example.com/x"');
    expect(out).not.toMatch(/[\r\n]/);
    expect(lines_of(out)).toEqual(SUPPORT_LINES);
  });

  it("turns preserved newlines from inline styles into line breaks", () => {
    for (const mode of ["pre-wrap", "pre-line", "pre", "break-spaces"]) {
      const out = paste(
        `<span style="${RENDERED_STYLE} white-space: ${mode};">Hi Adam,\nThanks for the report.\n\nBest,\nSupport</span>`,
        SUPPORT_PLAIN,
      );

      expect(out).not.toMatch(/[\r\n]/);
      expect(lines_of(out)).toEqual(SUPPORT_LINES);
    }
  });

  it("keeps the lines of preserved text split across a link", () => {
    const out = paste(
      `<span style="white-space: pre-wrap;">Hi Adam,\nThanks for the </span><a href="https://example.com/x" style="white-space: pre-wrap;">report</a><span style="white-space: pre-wrap;">.\n\nBest,\nSupport</span>`,
      SUPPORT_PLAIN,
    );

    expect(out).toContain("<a ");
    expect(lines_of(out)).toEqual(SUPPORT_LINES);
  });

  it("keeps the lines of div, paragraph, and br markup", () => {
    expect(
      lines_of(
        paste(
          "<div>Hi Adam,</div><div>Thanks for the report.</div><div><br></div><div>Best,</div><div>Support</div>",
          SUPPORT_PLAIN,
        ),
      ),
    ).toEqual(SUPPORT_LINES);
    expect(
      lines_of(
        paste(
          "Hi Adam,<br>Thanks for the report.<br><br>Best,<br>Support",
          SUPPORT_PLAIN,
        ),
      ),
    ).toEqual(SUPPORT_LINES);
    expect(
      lines_of(
        paste(
          "<p>Hi Adam,</p><p>Thanks for the report.</p><p>Best,<br>Support</p>",
          "Hi Adam,\r\n\r\nThanks for the report.\r\n\r\nBest,\r\nSupport",
        ),
      ),
    ).toEqual(["Hi Adam,", "Thanks for the report.", "Best,", "Support"]);
  });

  it("keeps a copied code block as preformatted text", () => {
    const out = paste(
      "<pre>Hi Adam,\nThanks for the report.\n\nBest,\nSupport</pre>",
      SUPPORT_PLAIN,
    );

    expect(out).toContain(
      "<pre>Hi Adam,\nThanks for the report.\n\nBest,\nSupport</pre>",
    );
  });

  it("keeps indentation that a preserved element shows", () => {
    const out = paste(
      '<div style="white-space: pre-wrap">a    b\n  c</div>',
      "a    b\n  c",
    );

    expect(out).toContain("a &nbsp; &nbsp;b<br>&nbsp; c");
  });

  it("still joins source lines that the page wrapped into one line", () => {
    const out = paste(
      "<p>Thanks for reaching out. Your account is\n    ready, and you can sign in\n    right away.</p>\n  <p>Best regards,<br>\n    Aster Support</p>",
      "Thanks for reaching out. Your account is ready, and you can sign in right away.\r\n\r\nBest regards,\r\nAster Support",
    );

    expect(lines_of(out)).toEqual([
      "Thanks for reaching out. Your account is ready, and you can sign in right away.",
      "Best regards,",
      "Aster Support",
    ]);
  });

  it("falls back to joining lines when the plain text does not match", () => {
    const out = paste(SUPPORT_PLAIN, "Something else entirely");

    expect(lines_of(out)).toEqual([
      "Hi Adam, Thanks for the report. Best, Support",
    ]);
  });
});

describe("reading the compose editor", () => {
  it("sends a typed Shift+Enter newline as a line break", () => {
    expect(editor_text_breaks_to_elements("<div>one\ntwo</div>")).toBe(
      "<div>one<br>two</div>",
    );
    expect(read_compose_editor_html("one\n\ntwo<div>three</div>")).toBe(
      "one<br><br>two<div>three</div>",
    );
  });

  it("leaves code blocks, quotes, and spacing between blocks alone", () => {
    const html =
      '<div>a</div>\n<div>b</div><pre>x\ny</pre><blockquote>q\nr</blockquote><div class="aster_quote">s\nt</div>';

    expect(editor_text_breaks_to_elements(html)).toBe(html);
  });

  it("counts one Enter as one line in plain text", () => {
    expect(
      lines_of(
        "Line one<div>Line two after Enter</div><div><br></div><div>Line four</div>",
      ),
    ).toEqual(["Line one", "Line two after Enter", "", "Line four"]);
    expect(lines_of("<div>a<br></div><div>b</div>")).toEqual(["a", "b"]);
    expect(lines_of("a<br>b<br><br>c")).toEqual(["a", "b", "", "c"]);
    expect(lines_of("a\nb")).toEqual(["a", "b"]);
    expect(lines_of("<p>a</p><p>b</p>")).toEqual(["a", "b"]);
  });
});

describe("plain text alternative of a composed body", () => {
  it("keeps the break before the first Enter-created line", () => {
    expect(outgoing_html_to_plain_text("aaa<div>bbb</div>")).toBe("aaa\nbbb");
  });

  it("keeps one blank line for one empty line", () => {
    expect(
      outgoing_html_to_plain_text(
        "<div>Hi Adam,</div><div><br></div><div>Best,</div><div>Support</div>",
      ),
    ).toBe("Hi Adam,\n\nBest,\nSupport");
  });

  it("keeps the lines of a pasted message", () => {
    expect(
      outgoing_html_to_plain_text(
        read_compose_editor_html(paste(SUPPORT_PLAIN, SUPPORT_PLAIN)),
      ),
    ).toBe(SUPPORT_LINES.join("\n"));
  });
});
