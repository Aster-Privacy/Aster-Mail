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

import { sanitize_html } from "./html_sanitizer";
import { inline_secure_view_images } from "./secure_view_inline_images";

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function png_attachment(filename: string, content_type = "image/png") {
  return { filename, content_type, data: PNG };
}

describe("inline_secure_view_images", () => {
  it("inlines an image whose content id matches an attachment filename", () => {
    const result = inline_secure_view_images(
      '<p><img src="cid:logo.png" alt="logo"></p>',
      [png_attachment("logo.png")],
    );

    expect(result).toContain("data:image/png;base64,");
    expect(result).not.toContain("cid:");
  });

  it("matches a content id that drops the file extension", () => {
    const result = inline_secure_view_images('<img src="cid:logo">', [
      png_attachment("logo.png"),
    ]);

    expect(result).toContain("data:image/png;base64,");
  });

  it("decodes a percent encoded content id before matching", () => {
    const result = inline_secure_view_images('<img src="cid:my%20logo.png">', [
      png_attachment("my logo.png"),
    ]);

    expect(result).toContain("data:image/png;base64,");
  });

  it("replaces an unmatched content id with a transparent placeholder", () => {
    const result = inline_secure_view_images('<img src="cid:missing.png">', [
      png_attachment("logo.png"),
    ]);

    expect(result).not.toContain("cid:");
    expect(result).toContain("data:image/gif;base64,");
  });

  it("does not inline an attachment that is not an image", () => {
    const result = inline_secure_view_images('<img src="cid:report.pdf">', [
      { filename: "report.pdf", content_type: "application/pdf", data: PNG },
    ]);

    expect(result).not.toContain("application/pdf");
    expect(result).toContain("data:image/gif;base64,");
  });

  it("resolves a background attribute reference", () => {
    const result = inline_secure_view_images(
      '<td background="cid:tile.png">cell</td>',
      [png_attachment("tile.png")],
    );

    expect(result).toContain('background="data:image/png;base64,');
  });

  it("survives the sanitizer settings the secure view page uses", () => {
    const inlined = inline_secure_view_images('<img src="cid:logo.png">', [
      png_attachment("logo.png"),
    ]);

    const sanitized = sanitize_html(inlined, {
      sandbox_mode: false,
      external_content_mode: "never",
      content_blocking: {
        block_remote_images: true,
        block_remote_fonts: true,
        block_remote_css: true,
        block_tracking_pixels: true,
      },
    }).html;

    expect(sanitized).toContain("data:image/png;base64,");
  });

  it("leaves html without content id references untouched", () => {
    const html = '<p>hello <a href="https://example.com">link</a></p>';

    expect(inline_secure_view_images(html, [])).toBe(html);
  });
});
