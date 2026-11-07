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
import {
  collapse_source_whitespace,
  collapse_source_whitespace_html,
} from "./html_source_whitespace";

import { plain_text_to_editor_html } from "@/hooks/editor_utils";

const paste = (html: string) =>
  sanitize_compose_paste(html, { collapse_source_whitespace: true });

const collapse = (html: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");

  collapse_source_whitespace(doc.body);

  return doc.body.innerHTML;
};

const text_of = (html: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");

  return doc.body.textContent || "";
};

const CHAT_CLIPBOARD = [
  "<html>",
  "<body>",
  '<!--StartFragment--><meta charset="utf-8"><div class="markdown prose">',
  "  <p>Thanks for reaching out. Your account is",
  "    ready, and you can sign in with <code>name@example.com</code>",
  "    right away.</p>",
  "  <p>",
  "    To change your plan, open <strong>Settings</strong>",
  "    and choose <span>Billing</span>.",
  "  </p>",
  "  <p>Best regards,<br>",
  "    Aster Support</p>",
  "</div><!--EndFragment-->",
  "</body>",
  "</html>",
].join("\r\n");

describe("collapse_source_whitespace on pasted clipboard html", () => {
  it("collapses indentation and newlines from a chat page selection", () => {
    const out = paste(CHAT_CLIPBOARD);

    expect(out).not.toMatch(/ {2}/);
    expect(out).not.toMatch(/[\r\n\t]/);
    expect(out).toBe(
      "<div>" +
        "<p>Thanks for reaching out. Your account is ready, and you can sign in with <code>name@example.com</code> right away.</p>" +
        "<p>To change your plan, open <strong>Settings</strong> and choose <span>Billing</span>.</p>" +
        "<p>Best regards,<br>Aster Support</p>" +
        "</div>",
    );
  });

  it("keeps the signature break without a leading space on the second line", () => {
    const out = paste(
      "<p>Best regards,<br>\n      Aster Support</p>\n<p>\n</p>",
    );

    expect(out).toContain("<p>Best regards,<br>Aster Support</p>");
  });

  it("collapses whitespace inside styled spans from a rendered page", () => {
    const out = paste(
      '<span style="color: rgb(13, 13, 13); white-space: normal; display: inline !important">Hello\n   there,</span>\n<span style="white-space-collapse: collapse">how   are you?</span>',
    );

    expect(text_of(out)).toBe("Hello there, how are you?");
  });

  it("merges a space that spans an inline element boundary", () => {
    expect(collapse("<p>foo <strong> bar</strong>  baz</p>")).toBe(
      "<p>foo <strong>bar</strong> baz</p>",
    );
  });

  it("keeps one space between adjacent inline elements on separate lines", () => {
    expect(collapse("<span>Hello</span>\n    <span>world</span>")).toBe(
      "<span>Hello</span> <span>world</span>",
    );
  });

  it("drops whitespace between list items and table cells", () => {
    expect(collapse("<ul>\n  <li>One</li>\n  <li> Two </li>\n</ul>")).toBe(
      "<ul><li>One</li><li>Two</li></ul>",
    );
    expect(
      collapse(
        "<table>\n <tbody>\n  <tr>\n   <td> A </td>\n   <td>B</td>\n  </tr>\n </tbody>\n</table>",
      ),
    ).toBe("<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>");
  });

  it("keeps code blocks in pre exactly as copied", () => {
    const code = 'fn main() {\n    println!("hi");\n\n    let  x = 1;\n}';
    const out = paste(`<p>Example:</p>\n<pre><code>${code}</code></pre>`);

    expect(out).toContain(`<pre><code>${code}</code></pre>`);
  });

  it("keeps spacing inside elements styled to preserve whitespace", () => {
    expect(
      collapse('<div style="white-space: pre-wrap">a    b\n  c</div>'),
    ).toBe('<div style="white-space: pre-wrap">a    b\n  c</div>');
    expect(
      collapse('<div style="white-space-collapse: preserve">a    b\n  c</div>'),
    ).toBe('<div style="white-space-collapse: preserve">a    b\n  c</div>');
  });

  it("collapses spaces but keeps newlines for pre-line content", () => {
    expect(
      collapse(
        '<div style="white-space: pre-line">one   two  \n   three</div>',
      ),
    ).toBe('<div style="white-space: pre-line">one two\nthree</div>');
  });

  it("goes back to collapsing inside a normal child of a preserved parent", () => {
    expect(
      collapse(
        '<div style="white-space: pre"><span style="white-space: normal">a   b</span></div>',
      ),
    ).toBe(
      '<div style="white-space: pre"><span style="white-space: normal">a b</span></div>',
    );
  });

  it("keeps non-breaking spaces the source rendered", () => {
    expect(collapse("<p>Total:&nbsp;&nbsp;42</p>")).toBe(
      "<p>Total:&nbsp;&nbsp;42</p>",
    );
    expect(collapse("<p>a&nbsp; b</p>")).toBe("<p>a&nbsp; b</p>");
  });

  it("keeps a selected space at the edge of an inline fragment", () => {
    const wrap = (fragment: string) =>
      `<html><body>\r\n<!--StartFragment-->${fragment}<!--EndFragment-->\r\n</body></html>`;

    expect(paste(wrap(" world"))).toBe(" world");
    expect(paste(wrap("brown "))).toBe("brown ");
    expect(paste(wrap("brown fox"))).toBe("brown fox");
    expect(paste(wrap("brown\n  fox\n"))).toBe("brown fox");
  });

  it("drops the line breaks a clipboard wrapper puts around the fragment", () => {
    expect(
      collapse_source_whitespace_html(
        "<body>\r\n<!--StartFragment--><p>Hi</p><!--EndFragment-->\r\n</body>",
      ),
    ).toBe("<p>Hi</p>");
  });

  it("keeps spaces around inline images", () => {
    expect(
      collapse('<p>before <img src="https://example.com/a.png">  after</p>'),
    ).toBe('<p>before <img src="https://example.com/a.png"> after</p>');
  });

  it("treats an inline-displayed div as inline content", () => {
    expect(
      collapse(
        '<div style="display: inline">a</div>\n<div style="display:inline">b</div>',
      ),
    ).toBe(
      '<div style="display: inline">a</div> <div style="display:inline">b</div>',
    );
  });

  it("handles very large whitespace runs in linear time", () => {
    const run = " ".repeat(200000);

    expect(collapse(`<div style="white-space: pre-line">a${run}b</div>`)).toBe(
      '<div style="white-space: pre-line">a b</div>',
    );
    expect(collapse(`<p>a${run}\n${run}b</p>`)).toBe("<p>a b</p>");
  });

  it("leaves html untouched when the option is off", () => {
    const out = sanitize_compose_paste("<p>a\n    b</p>");

    expect(out).toBe("<p>a\n    b</p>");
  });
});

describe("plain text paste spacing", () => {
  it("does not add spaces to single-spaced text", () => {
    expect(plain_text_to_editor_html("one two\nthree four")).toBe(
      "<div>one two</div><div>three four</div>",
    );
  });

  it("keeps meaningful runs of spaces visible", () => {
    expect(plain_text_to_editor_html("a  b")).toBe("<div>a &nbsp;b</div>");
  });
});
