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

const TRACKS_FOLDER = "https://cdn.label.com/tracks/38271/cover.jpg";
const PIXEL_PRODUCT = "https://img.store.com/assets/pixel-perfect-logo.png";
const SES_CONTENT = "https://email.amazonses.com/images/header.png";
const STYLED_TRACK = "https://cdn.news.com/track/hero.jpg";
const BEACON_PATH = "https://mail.sender.example/track/abc123.gif";
const SES_OPEN = "https://email.amazonses.com/open/abc123.gif";

function classify(html: string) {
  return sanitize_html(`<p>body</p>${html}`, {
    external_content_mode: "never",
  });
}

describe("tracker url matching does not swallow content images", () => {
  it("keeps an image inside a folder whose name merely starts with track", () => {
    const result = classify(`<img src="${TRACKS_FOLDER}">`);

    expect(result.html).toContain('data-tracking-pixel="false"');
    expect(result.external_content.has_tracking_pixels).toBe(false);
  });

  it("keeps a product image whose filename starts with pixel", () => {
    const result = classify(`<img src="${PIXEL_PRODUCT}">`);

    expect(result.html).toContain('data-tracking-pixel="false"');
  });

  it("keeps an ordinary image served from a bulk sending domain", () => {
    const result = classify(`<img src="${SES_CONTENT}">`);

    expect(result.html).toContain('data-tracking-pixel="false"');
  });

  it("keeps a tracker path image that declares a real size in css", () => {
    const result = classify(`<img src="${STYLED_TRACK}" style="width:600px">`);

    expect(result.html).toContain('data-tracking-pixel="false"');
  });

  it("keeps a tracker path image sized with a percentage width", () => {
    const result = classify(`<img src="${STYLED_TRACK}" style="width:100%">`);

    expect(result.html).toContain('data-tracking-pixel="false"');
  });

  it("still flags a beacon on a real track path", () => {
    const result = classify(`<img src="${BEACON_PATH}">`);

    expect(result.html).toContain('data-tracking-pixel="true"');
  });

  it("still flags a bulk sender open beacon", () => {
    const result = classify(`<img src="${SES_OPEN}">`);

    expect(result.html).toContain('data-tracking-pixel="true"');
  });
});
