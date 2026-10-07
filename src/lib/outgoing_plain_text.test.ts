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
import { describe, expect, it } from "vitest";

import { outgoing_html_to_plain_text } from "./outgoing_plain_text";

import { escape_html } from "@/hooks/editor_utils";

function as_plain_mode_body(text: string): string {
  return escape_html(text).replace(/\n/g, "<br>");
}

describe("outgoing_html_to_plain_text", () => {
  it("gives back exactly the text typed in plain text mode", () => {
    const typed =
      'Use <project> & don\'t "quote" me\n\n  indented    code\n\tTabbed\nlast line';

    expect(outgoing_html_to_plain_text(as_plain_mode_body(typed))).toBe(typed);
  });

  it("keeps non-ASCII text as characters", () => {
    const typed = "Olá, até já ✓ 日本語";

    expect(outgoing_html_to_plain_text(as_plain_mode_body(typed))).toBe(typed);
  });

  it("writes a text signature on its own lines", () => {
    const body =
      as_plain_mode_body("Thanks") +
      '<div data-aster-signature="1" data-aster-signature-id="s1">--<br><b>Jane Doe</b><br><a href="https://example.org/jane">My page</a></div>';

    expect(outgoing_html_to_plain_text(body)).toBe(
      "Thanks\n--\nJane Doe\nMy page <https://example.org/jane>",
    );
  });

  it("does not repeat a link that shows its own address", () => {
    expect(
      outgoing_html_to_plain_text(
        '<a href="https://example.org">https://example.org</a>',
      ),
    ).toBe("https://example.org");
  });

  it("quotes a blockquote with > markers", () => {
    const body =
      "Sounds good<br><br>" +
      '<div class="aster_quote"><div class="aster_quote_attr">Sam wrote:</div>' +
      "<blockquote><p>First line</p><p>Second\n   line</p></blockquote></div>";

    expect(outgoing_html_to_plain_text(body)).toBe(
      "Sounds good\n\nSam wrote:\n> First line\n> Second line",
    );
  });

  it("keeps preformatted text as written", () => {
    expect(outgoing_html_to_plain_text("<pre>a  b\n  c</pre>")).toBe(
      "a  b\n  c",
    );
  });

  it("numbers ordered list items and bullets the others", () => {
    expect(
      outgoing_html_to_plain_text(
        '<ol start="3"><li>three</li><li>four</li></ol><ul><li>dot</li></ul>',
      ),
    ).toBe("3. three\n4. four\n- dot");
  });

  it("drops scripts, styles and images without alt text", () => {
    expect(
      outgoing_html_to_plain_text(
        '<style>p{color:red}</style><script>alert(1)</script><img src="https://tracker.example/p.gif"><img alt="Logo" src="x.png">Hi',
      ),
    ).toBe("[Logo]Hi");
  });

  it("stops nesting quote markers past a fixed depth", () => {
    const depth = 40;
    const body =
      "<blockquote>".repeat(depth) + "deep" + "</blockquote>".repeat(depth);
    const line = outgoing_html_to_plain_text(body);

    expect(line.endsWith("deep")).toBe(true);
    expect(line.split(">").length - 1).toBe(8);
  });

  it("ignores the source formatting of pretty printed html", () => {
    expect(
      outgoing_html_to_plain_text(
        "<div>\n    Hello\n    world\n</div>\n<p>one</p>\n<p>two</p>\n<blockquote>\n  <p>\n    Quoted\n  </p>\n</blockquote>",
      ),
    ).toBe("Hello world\none\ntwo\n> Quoted");
  });

  it("puts table cells on one line without trailing spaces", () => {
    expect(
      outgoing_html_to_plain_text(
        "<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>",
      ),
    ).toBe("A B\nC D");
  });

  it("keeps numbering a long ordered list", () => {
    const count = 2000;
    const text = outgoing_html_to_plain_text(
      "<ol>" + "<li>x</li>".repeat(count) + "</ol>",
    );

    expect(text.split("\n")).toHaveLength(count);
    expect(text.endsWith(`${count}. x`)).toBe(true);
  });

  it("does not overflow the stack on deeply nested markup", () => {
    const depth = 5000;
    const body = "<div>".repeat(depth) + "deep" + "</div>".repeat(depth);

    expect(outgoing_html_to_plain_text(body)).toBe("deep");
  });

  it("does not turn a null character in the text into a line break", () => {
    expect(outgoing_html_to_plain_text("a\u0000b")).toBe("ab");
  });

  it("returns an empty string for an empty body", () => {
    expect(outgoing_html_to_plain_text("")).toBe("");
  });
});
