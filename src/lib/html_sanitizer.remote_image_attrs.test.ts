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

const TRACKER = "https://tracker.example.com/leak.png";
const PROXY = "/api/images/v1/proxy";

const LEAD = "<p>lead</p>";

describe("remote image attribute leaks (srcset / background)", () => {
  it("drops a remote srcset and blocks src when remote images are blocked", () => {
    const result = sanitize_html(
      `${LEAD}<img src="${TRACKER}" srcset="${TRACKER} 2x, ${TRACKER} 1x" width="200" height="100" alt="pic">`,
      { external_content_mode: "never", image_proxy_url: PROXY },
    );

    const html = result.html.toLowerCase();
    expect(html).not.toContain("tracker.example.com");
    expect(html).not.toContain("srcset");
    expect(result.external_content.has_remote_images).toBe(true);
    expect(result.external_content.blocked_count).toBeGreaterThan(0);
  });

  it("removes the srcset even when auto-loading so nothing fetches direct from the tracker", () => {
    const result = sanitize_html(
      `${LEAD}<img src="${TRACKER}" srcset="${TRACKER} 2x" width="200" height="100" alt="pic">`,
      { external_content_mode: "always", image_proxy_url: PROXY },
    );

    expect(result.html.toLowerCase()).not.toContain("srcset");
    expect(result.html).not.toContain(`${TRACKER} 2x`);
    expect(result.html).toContain(`${PROXY}?url=`);
  });

  it("blocks a remote background attribute when remote images are blocked", () => {
    const result = sanitize_html(
      `${LEAD}<table><tr><td background="${TRACKER}">cell</td></tr></table>`,
      { external_content_mode: "never", image_proxy_url: PROXY },
    );

    expect(result.html.toLowerCase()).not.toContain("tracker.example.com");
    expect(result.external_content.has_remote_images).toBe(true);
    expect(result.external_content.blocked_count).toBeGreaterThan(0);
  });

  it("routes a remote background through the proxy when auto-loading", () => {
    const result = sanitize_html(
      `${LEAD}<table><tr><td background="${TRACKER}">cell</td></tr></table>`,
      { external_content_mode: "always", image_proxy_url: PROXY },
    );

    expect(result.html).toContain(`${PROXY}?url=`);
    expect(result.html).toContain(encodeURIComponent(TRACKER));
    expect(result.html).not.toContain(`background="${TRACKER}"`);
  });

  it("drops remote srcset and background under lockdown", () => {
    const result = sanitize_html(
      `${LEAD}<img src="${TRACKER}" srcset="${TRACKER} 2x" width="200" height="100" alt="pic">` +
        `<table><tr><td background="${TRACKER}">cell</td></tr></table>`,
      {
        external_content_mode: "always",
        image_proxy_url: PROXY,
        lockdown_mode: true,
      },
    );

    const html = result.html.toLowerCase();
    expect(html).not.toContain("tracker.example.com");
    expect(html).not.toContain("srcset");
  });

  it("preserves an inline data: background", () => {
    const data_bg =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const result = sanitize_html(
      `${LEAD}<table><tr><td background="${data_bg}">cell</td></tr></table>`,
      { external_content_mode: "never", image_proxy_url: PROXY },
    );

    expect(result.html).toContain("data:image/png;base64,");
  });
});
