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
import { describe, it, expect, vi, afterEach } from "vitest";

import { sanitize_html, type SanitizeOptions } from "./html_sanitizer";

const PIXEL = "https://tracker.example.com/open.gif";
const PHOTO = "https://tracker.example.com/photo.png";
const PROXY = "/api/images/v1/proxy";

const EMAIL = [
  "<p>lead</p>",
  `<img src="${PIXEL}" width="1" height="1">`,
  `<img src="${PHOTO}" srcset="${PHOTO} 2x" width="300" height="200" alt="photo">`,
  `<img src="http://tracker.example.com/plain.png" width="300" height="200">`,
  `<img src="//tracker.example.com/relative.png" width="300" height="200">`,
  `<picture><source srcset="${PHOTO} 1x"><img src="${PHOTO}" alt="pic"></picture>`,
  `<table><tr><td background="${PHOTO}">cell</td></tr></table>`,
  `<a href="https://example.com/?utm_source=x">link</a><p>see https://example.com/plain</p>`,
].join("");

const MODES: Array<[string, SanitizeOptions]> = [
  ["ask", { external_content_mode: "ask", image_proxy_url: PROXY }],
  ["never", { external_content_mode: "never", image_proxy_url: PROXY }],
  [
    "content blocking",
    {
      external_content_mode: "ask",
      image_proxy_url: PROXY,
      content_blocking: {
        block_remote_images: true,
        block_remote_fonts: true,
        block_remote_css: true,
        block_tracking_pixels: true,
      },
    },
  ],
  ["lockdown", { external_content_mode: "ask", lockdown_mode: true }],
  [
    "always with proxy",
    { external_content_mode: "always", image_proxy_url: PROXY },
  ],
  [
    "sandbox",
    {
      external_content_mode: "ask",
      image_proxy_url: PROXY,
      sandbox_mode: true,
    },
  ],
];

describe("sanitize_html never builds email markup in the live document", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const [label, options] of MODES) {
    it(`creates no live-document nodes in ${label} mode`, () => {
      const create_element = vi.spyOn(document, "createElement");
      const create_fragment = vi.spyOn(document, "createDocumentFragment");
      const create_text = vi.spyOn(document, "createTextNode");

      const result = sanitize_html(EMAIL, options);

      expect(result.html).toContain("lead");
      expect(create_element).not.toHaveBeenCalled();
      expect(create_fragment).not.toHaveBeenCalled();
      expect(create_text).not.toHaveBeenCalled();
    });
  }

  it("never leaves a direct remote src in the output when images are blocked", () => {
    const result = sanitize_html(EMAIL, {
      external_content_mode: "ask",
      image_proxy_url: PROXY,
    });

    expect(result.html).not.toMatch(/\ssrc="(?:https?:)?\/\/tracker/i);
    expect(result.html).not.toMatch(/srcset="[^"]*tracker\.example\.com/i);
    expect(result.html).toContain('data-blocked="true"');
    expect(result.external_content.blocked_count).toBeGreaterThan(0);
  });

  it("still proxies remote images when they are allowed", () => {
    const result = sanitize_html(EMAIL, {
      external_content_mode: "always",
      image_proxy_url: PROXY,
    });

    expect(result.html).not.toMatch(/\ssrc="(?:https?:)?\/\/tracker/i);
    expect(result.html).toContain(`${PROXY}?url=${encodeURIComponent(PHOTO)}`);
    expect(result.html).toContain('<a href="https://example.com/plain"');
  });
});
