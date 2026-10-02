//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import { plain_text_to_editor_html } from "./editor_utils";

describe("plain_text_to_editor_html", () => {
  it("keeps blank lines between paragraphs", () => {
    expect(plain_text_to_editor_html("Hi Diogo,\r\n\r\nThanks.\r\n")).toBe(
      "<div>Hi Diogo,</div><div><br></div><div>Thanks.</div><div><br></div>",
    );
  });

  it("escapes markup and keeps indentation", () => {
    expect(plain_text_to_editor_html("<b>x</b>\n  y")).toBe(
      "<div>&lt;b&gt;x&lt;/b&gt;</div><div> &nbsp;y</div>",
    );
  });

  it("keeps a single line as one block", () => {
    expect(plain_text_to_editor_html("one line")).toBe("<div>one line</div>");
  });
});
