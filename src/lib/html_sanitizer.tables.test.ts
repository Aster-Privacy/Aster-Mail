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
// @vitest-environment jsdom
//
// Runs under jsdom: DOMPurify strips table wrappers under happy-dom (a DOM
// incompatibility that does not occur in real browsers), which would make
// this preservation check fail for environment reasons rather than real
// sanitizer regressions.
//
import { describe, it, expect } from "vitest";

import { sanitize_html } from "./html_sanitizer";

describe("sanitize_html table preservation", () => {
  it("keeps tables and their structure", () => {
    const input =
      "<table><thead><tr><th>H</th></tr></thead>" +
      "<tbody><tr><td>cell</td></tr></tbody></table>";
    const { html } = sanitize_html(input);

    expect(html.toLowerCase()).toContain("<table");
    expect(html.toLowerCase()).toContain("<td");
    expect(html).toContain("cell");
    expect(html).toContain("H");
  });

  it("keeps nested layout tables used by newsletters", () => {
    const input =
      "<table><tbody><tr><td>" +
      "<table><tbody><tr><td>inner</td></tr></tbody></table>" +
      "</td></tr></tbody></table>";
    const { html } = sanitize_html(input);

    expect((html.toLowerCase().match(/<table/g) ?? []).length).toBe(2);
    expect(html).toContain("inner");
  });
});
