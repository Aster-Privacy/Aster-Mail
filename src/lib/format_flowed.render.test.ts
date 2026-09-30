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

import { plain_text_to_html } from "./html_sanitizer";

const flowed_message = [
  "Hi team,",
  "",
  "I wanted to share a quick update about the new message rendering. This ",
  "paragraph was soft wrapped by the sending client at seventy two columns, ",
  "so every physical line ends in a space and the reader is expected to ",
  "reflow it into one continuous paragraph.",
  "",
  "Second paragraph stays separate.",
].join("\n");

const fixed_message = [
  "  def flow(text):",
  "      return text.strip()",
  "",
  "ASCII table:",
  "+----+----+",
  "| a  | b  |",
  "+----+----+",
].join("\n");

describe("plain_text_to_html end-to-end (desktop/web viewer path)", () => {
  it("reflows a real format=flowed body into continuous paragraphs", () => {
    const html = plain_text_to_html(flowed_message);

    expect(html).toContain(
      "This paragraph was soft wrapped by the sending client at seventy two columns, so every physical line ends in a space and the reader is expected to reflow it into one continuous paragraph.",
    );
    expect(html).toContain('<p dir="auto">Hi team,</p>');
    expect(html).toContain(
      '<p dir="auto">Second paragraph stays separate.</p>',
    );
    expect(html).not.toContain("seventy two columns, <br>");
  });

  it("leaves fixed plain text (code, ASCII art) untouched", () => {
    const html = plain_text_to_html(fixed_message);

    expect(html).toContain("def flow(text):<br>");
    expect(html).toContain("+----+----+<br>");
    expect(html).toContain("| a  | b  |");
    expect(html).not.toContain("def flow(text):      return");
  });
});
