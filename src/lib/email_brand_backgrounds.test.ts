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

import { build_forced_dark_mode_css } from "./email_body_styles";
import {
  BRAND_BACKGROUND_MARK,
  is_page_surface,
  mark_brand_backgrounds,
} from "./email_brand_backgrounds";
import { sanitize_html } from "./html_sanitizer";

const OPTIONS = {
  external_content_mode: "always" as const,
  sandbox_mode: true,
};

function mark(html: string): string {
  const root = document.createElement("div");

  root.innerHTML = html;
  mark_brand_backgrounds(root);

  return root.innerHTML;
}

describe("brand colored backgrounds under forced dark mode", () => {
  it("treats a light background as a page surface", () => {
    expect(is_page_surface("#ffffff")).toBe(true);
    expect(is_page_surface("#f4f4f4")).toBe(true);
  });

  it("treats a saturated brand color as a block to keep", () => {
    expect(is_page_surface("#1a73e8")).toBe(false);
    expect(is_page_surface("rgb(26, 115, 232)")).toBe(false);
  });

  it("marks a call to action cell and the link inside it", () => {
    const marked = mark(
      '<table><tr><td bgcolor="#1a73e8"><a href="https://example.com" style="color:#ffffff">Read more</a></td></tr></table>',
    );

    expect(marked).toContain(`${BRAND_BACKGROUND_MARK}="1"`);
    expect(marked.match(new RegExp(BRAND_BACKGROUND_MARK, "g"))).toHaveLength(
      2,
    );
  });

  it("leaves a white layout cell unmarked", () => {
    const marked = mark(
      '<table><tr><td bgcolor="#ffffff">Body copy</td></tr></table>',
    );

    expect(marked).not.toContain(BRAND_BACKGROUND_MARK);
  });

  it("leaves a background image cell to the image rules", () => {
    const marked = mark(
      '<div style="background:url(cid:hero@aster) #1a73e8">Hero</div>',
    );

    expect(marked).not.toContain(BRAND_BACKGROUND_MARK);
  });

  it("marks a brand cell while sanitizing a message", () => {
    const result = sanitize_html(
      '<table><tr><td bgcolor="#0b5cff">Sale</td></tr></table>',
      OPTIONS,
    );

    expect(result.html).toContain(BRAND_BACKGROUND_MARK);
  });

  it("excludes marked elements from the forced dark neutralization", () => {
    const css = build_forced_dark_mode_css();

    expect(css).toContain(`td:not([style*="background-image" i])`);
    expect(css).toContain(`:not([${BRAND_BACKGROUND_MARK}])`);
  });
});
