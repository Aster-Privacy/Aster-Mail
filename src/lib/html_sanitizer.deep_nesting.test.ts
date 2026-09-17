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
import { sanitize_html, degraded_text_html } from "@/lib/html_sanitizer";

const marketing_css = `@font-face { font-family: 'Euclid Circular A'; src: url('https://example.test/font.woff2'); }
a { text-decoration: none; }
#outlook a { padding: 0; }
.ExternalClass { width: 100%; }`;

const build_email = (body: string) =>
  `<html><head><style type="text/css">${marketing_css}</style></head><body>${body}</body></html>`;

const assert_no_css_text = (html: string) => {
  const without_style_blocks = html.replace(
    /<style[\s\S]*?<\/style\s*>/gi,
    " ",
  );
  expect(without_style_blocks).not.toContain("text-decoration: none");
  expect(without_style_blocks).not.toContain("@font-face");
  expect(without_style_blocks).not.toContain(".ExternalClass");
  expect(without_style_blocks).not.toContain("#outlook");
};

describe("html_sanitizer deep nesting", () => {
  const depths = [200, 600, 1500, 3000, 8000];

  for (const depth of depths) {
    it(`keeps css out of the rendered body for ${depth} nested divs`, () => {
      const body =
        "<div>".repeat(depth) + "readable body" + "</div>".repeat(depth);
      const result = sanitize_html(build_email(body), { sandbox_mode: true });

      assert_no_css_text(result.html);
      expect(result.html).toContain("readable body");
    });

    it(`keeps css out of the rendered body for ${depth} nested table cells`, () => {
      const body =
        "<table><tr><td>".repeat(depth) +
        "readable body" +
        "</td></tr></table>".repeat(depth);
      const result = sanitize_html(build_email(body), { sandbox_mode: true });

      assert_no_css_text(result.html);
      expect(result.html).toContain("readable body");
    });
  }

  it("keeps css out of the rendered body without sandbox mode", () => {
    const body = "<div>".repeat(4000) + "readable body" + "</div>".repeat(4000);
    const result = sanitize_html(build_email(body));

    assert_no_css_text(result.html);
    expect(result.html).toContain("readable body");
  });

  it("degrades unparseable html to readable text without css", () => {
    const html = build_email(
      "<div>readable body</div><script>window.x = 1;</script>",
    );
    const degraded = degraded_text_html(html);

    assert_no_css_text(degraded);
    expect(degraded).not.toContain("window.x");
    expect(degraded).toContain("readable body");
  });

  it("degrades an unterminated style block without leaking css", () => {
    const degraded = degraded_text_html(
      `<body><p>readable body</p><style type="text/css">${marketing_css}`,
    );

    assert_no_css_text(degraded);
    expect(degraded).toContain("readable body");
  });

  it("returns escaped markup rather than raw tags", () => {
    const degraded = degraded_text_html("<p>readable body</p>");

    expect(degraded).not.toContain("<p>readable body</p>");
    expect(degraded).toContain("readable body");
  });
});
