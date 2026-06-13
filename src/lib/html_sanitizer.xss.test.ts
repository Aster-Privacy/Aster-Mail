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

import { sanitize_html } from "./html_sanitizer";

const has_event_handler = (html: string): boolean =>
  /\son[a-z]+\s*=/i.test(html);

const has_javascript_uri = (html: string): boolean =>
  /(?:href|src)\s*=\s*["']?\s*javascript:/i.test(html);

describe("sanitize_html xss regression", () => {
  const payloads: Array<{ name: string; input: string }> = [
    { name: "img onerror", input: "<img src=x onerror=alert(1)>" },
    { name: "javascript href", input: '<a href="javascript:alert(1)">x</a>' },
    { name: "svg onload", input: "<svg onload=alert(1)></svg>" },
    {
      name: "details ontoggle",
      input: "<details open ontoggle=alert(1)>x</details>",
    },
    { name: "style import", input: "<style>@import url(//evil)</style>" },
    {
      name: "div onmouseover",
      input: "<div onmouseover=alert(1)>hover</div>",
    },
  ];

  for (const { name, input } of payloads) {
    it(`produces inert output for ${name}`, () => {
      const { html } = sanitize_html(input);

      expect(has_event_handler(html)).toBe(false);
      expect(has_javascript_uri(html)).toBe(false);
      expect(html.toLowerCase()).not.toContain("javascript:");
    });
  }

  it("strips all on* event handler attributes across payloads", () => {
    const combined = payloads.map((p) => p.input).join("");
    const { html } = sanitize_html(combined);

    expect(has_event_handler(html)).toBe(false);
  });

  it("does not emit head style blocks outside sandbox mode", () => {
    const input = "<head><style>@import url(//evil)</style></head><body>hi</body>";
    const { html } = sanitize_html(input, { sandbox_mode: false });

    expect(html).not.toContain("@import");
    expect(html.toLowerCase()).not.toContain("//evil");
  });
});
