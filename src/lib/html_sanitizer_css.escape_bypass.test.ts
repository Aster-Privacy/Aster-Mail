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

import { sanitize_html, type SanitizeOptions } from "./html_sanitizer";
import {
  sanitize_css_block,
  sanitize_style,
  strip_css_urls,
} from "./html_sanitizer_css";

const COLLECTOR = "https://collector.example/p.png";
const SAME_ORIGIN = "/api/images/v1/proxy?url=https%3A%2F%2Fcollector.example";
const BACKSLASH = String.fromCharCode(92);
const FETCHING_CALL = /(?:url|src|image-set|image)\s*\([^)]*collector/i;

const BLOCKED: SanitizeOptions = {
  external_content_mode: "never",
  image_proxy_url: "/api/images/v1/proxy",
  sandbox_mode: true,
  content_blocking: {
    block_remote_images: true,
    block_remote_fonts: true,
    block_remote_css: true,
    block_tracking_pixels: true,
  },
};

const ESCAPED_URL_HEADS = [
  "\\\\\\\\url",
  "\\\\url",
  "\\\\75rl",
  "\\5c url",
  "\\5c 75rl",
  "\\5C\\5C 75rl",
  "\\\\\\5c url",
  "u\\\\rl",
  "\\75 \\72 \\6c ",
];

describe("css escapes cannot hide a url()", () => {
  for (const head of ESCAPED_URL_HEADS) {
    it(`blocks ${JSON.stringify(head)} in a style attribute`, () => {
      for (const target of [COLLECTOR, SAME_ORIGIN]) {
        const html = `<div style="background:${head}(${target})">x</div>`;
        const out = sanitize_html(html, BLOCKED);

        expect(out).not.toContain("collector.example");
        expect(out).not.toContain(BACKSLASH);
      }
    });

    it(`blocks ${JSON.stringify(head)} in a style block`, () => {
      const css = `p{background:${head}(${COLLECTOR})}`;
      const out = strip_css_urls(sanitize_css_block(css));

      expect(out).not.toMatch(FETCHING_CALL);
      expect(out).not.toContain(BACKSLASH);
    });
  }

  it("leaves no backslash for the browser to decode a second time", () => {
    for (const head of ESCAPED_URL_HEADS) {
      expect(sanitize_style(`background:${head}(#a)`, true)).not.toContain(
        BACKSLASH,
      );
    }
  });

  it("still decodes ordinary escapes in legitimate styles", () => {
    expect(
      sanitize_style('font-family:"\\5FAE\\8F6F\\96C5\\9ED1"', true),
    ).toContain("微软雅黑");
    expect(sanitize_style('content:"\\201C"', true)).toContain("“");
    expect(sanitize_style("color:\\72 ed", true)).toContain("color:red");
  });
});
