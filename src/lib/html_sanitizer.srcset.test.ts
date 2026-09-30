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

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("srcset survives sanitization for inline images", () => {
  it("keeps a cid srcset on a picture source", () => {
    const result = sanitize_html(
      '<picture><source srcset="cid:logo 1x, cid:logo2x 2x"><img src="cid:logo"></picture>',
    );

    expect(result.html).toContain('srcset="cid:logo 1x, cid:logo2x 2x"');
  });

  it("keeps a data url srcset that contains commas", () => {
    const result = sanitize_html(
      `<div><img src="${PNG}" srcset="${PNG} 2x"></div>`,
    );

    expect(result.html).toContain(`srcset="${PNG} 2x"`);
  });

  it("keeps a relative srcset candidate", () => {
    const result = sanitize_html('<div><img srcset="/inline/a.png 1x"></div>');

    expect(result.html).toContain('srcset="/inline/a.png 1x"');
  });

  it("drops only the remote candidate when images are blocked", () => {
    const result = sanitize_html(
      '<div><img srcset="cid:logo 1x, https://tracker.example.com/a.png 2x"></div>',
      { external_content_mode: "never" },
    );

    expect(result.html).toContain('srcset="cid:logo 1x"');
    expect(result.html).not.toContain("tracker.example.com");
    expect(result.external_content.has_remote_images).toBe(true);
    expect(result.external_content.blocked_count).toBe(1);
  });

  it("drops the attribute entirely when every candidate is blocked", () => {
    const result = sanitize_html(
      '<div><img srcset="https://tracker.example.com/a.png 2x"></div>',
      { external_content_mode: "never" },
    );

    expect(result.html).not.toContain("srcset");
  });

  it("routes remote candidates through the image proxy when one is set", () => {
    const result = sanitize_html(
      '<div><img srcset="https://cdn.example.com/a.png 2x"></div>',
      {
        external_content_mode: "always",
        image_proxy_url: "https://proxy.example.com/img",
      },
    );

    expect(result.html).toContain("https://proxy.example.com/img?url=");
  });

  it("drops only the remote srcset candidates in lockdown mode", () => {
    const result = sanitize_html(
      '<div><img srcset="cid:logo 1x, https://cdn.example.com/a.png 2x"></div>',
      {
        lockdown_mode: true,
      },
    );

    expect(result.html).toContain('srcset="cid:logo 1x"');
    expect(result.html).not.toContain("cdn.example.com");
  });

  it("drops a srcset that is entirely remote in lockdown mode", () => {
    const result = sanitize_html(
      '<div><img srcset="https://cdn.example.com/a.png 2x"></div>',
      {
        lockdown_mode: true,
      },
    );

    expect(result.html).not.toContain("srcset");
  });
});
