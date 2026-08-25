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

const COVER = "https://cdn.label.com/track/38271/album-cover.jpg";
const HERO = "https://img.store.com/pixel-9-pro-hero.jpg";
const BEACON = "https://mail.sender.example/open/abc123.gif";

function blocked(html: string) {
  return sanitize_html(`<p>body</p>${html}`, {
    external_content_mode: "never",
  });
}

describe("content images whose url matches a tracker pattern", () => {
  it("keeps a captioned image that a tracker url pattern would otherwise match", () => {
    const result = blocked(
      `<img src="${COVER}" width="600" height="600" alt="Album art">`,
    );

    expect(result.html).toContain(COVER);
    expect(result.html).toContain('data-tracking-pixel="false"');
    expect(result.external_content.has_tracking_pixels).toBe(false);
  });

  it("keeps a full-size image that carries no alt text", () => {
    const result = blocked(`<img src="${HERO}" width="600" height="400">`);

    expect(result.html).toContain(HERO);
    expect(result.html).toContain('data-tracking-pixel="false"');
  });

  it("still classifies a one pixel beacon as tracking", () => {
    const result = blocked(`<img src="${BEACON}" width="1" height="1">`);

    expect(result.external_content.has_tracking_pixels).toBe(true);
    expect(result.html).toContain('data-tracking-pixel="true"');
  });

  it("leaves no visible text behind for a blocked beacon", () => {
    const result = blocked(`<img src="${BEACON}">`);

    expect(result.html).not.toContain("[Image blocked]");
    expect(result.html).toContain('data-tracking-pixel="true"');
  });

  it("keeps a beacon recoverable instead of deleting it", () => {
    const result = blocked(`<img src="${BEACON}">`);

    expect(result.html).toContain(`data-original-src="${BEACON}"`);
  });
});
