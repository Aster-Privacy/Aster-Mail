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

const TRACKER = "https://tracker.example.com/beacon.png";

const options = (
  external_content_mode: "never" | "ask" | "always",
  content_blocking?: SanitizeOptions["content_blocking"],
  lockdown_mode = false,
): SanitizeOptions => ({
  external_content_mode,
  sandbox_mode: true,
  lockdown_mode,
  image_proxy_url: "https://proxy.example.com/img",
  content_blocking,
});

const head_style_email = (css: string) =>
  `<html><head><style>${css}</style></head><body><table><tr><td class="a"><p>hello</p></td></tr></table></body></html>`;

const body_style_email = (css: string) =>
  `<html><body><style>${css}</style><table><tr><td class="a"><p>hello</p></td></tr></table></body></html>`;

const inline_style_email = (style: string) =>
  `<html><body><table><tr><td style="${style}"><p>hello</p></td></tr></table></body></html>`;

const REMOTE_RULE = `.a { background-image: url(${TRACKER}); }`;

describe("remote css urls in sandboxed rendering", () => {
  it("strips remote url() from head css when blocking is on", () => {
    const result = sanitize_html(head_style_email(REMOTE_RULE), options("never"));

    expect(result.html).not.toContain("tracker.example.com");
  });

  it.skip("strips remote url() from body css when blocking is on", () => {
    const result = sanitize_html(body_style_email(REMOTE_RULE), options("never"));

    expect(result.html).not.toContain("tracker.example.com");
  });

  it("strips remote url() from an inline style attribute when blocking is on", () => {
    const result = sanitize_html(
      inline_style_email(`background-image: url(${TRACKER})`),
      options("never"),
    );

    expect(result.html).not.toContain("tracker.example.com");
  });

  it("strips remote head css url() when only remote images are blocked", () => {
    const result = sanitize_html(
      head_style_email(REMOTE_RULE),
      options("always", {
        block_remote_images: true,
        block_remote_fonts: false,
        block_remote_css: false,
        block_tracking_pixels: false,
      }),
    );

    expect(result.html).not.toContain("tracker.example.com");
  });

  it("strips remote head css url() when only remote css is blocked", () => {
    const result = sanitize_html(
      head_style_email(REMOTE_RULE),
      options("always", {
        block_remote_images: false,
        block_remote_fonts: false,
        block_remote_css: true,
        block_tracking_pixels: false,
      }),
    );

    expect(result.html).not.toContain("tracker.example.com");
  });

  it("strips remote head css url() in lockdown mode regardless of preferences", () => {
    const result = sanitize_html(
      head_style_email(REMOTE_RULE),
      options("always", undefined, true),
    );

    expect(result.html).not.toContain("tracker.example.com");
  });

  it("reports blocked head css so the external content banner can offer a reload", () => {
    const result = sanitize_html(head_style_email(REMOTE_RULE), options("never"));

    expect(result.external_content.has_remote_css).toBe(true);
    expect(
      result.external_content.blocked_items.some(
        (item) => item.type === "css" && item.url.includes("tracker.example.com"),
      ),
    ).toBe(true);
  });

  it("removes remote @font-face from head css when fonts are blocked", () => {
    const result = sanitize_html(
      head_style_email(
        `@font-face { font-family: x; src: url(https://fonts.example.com/x.woff2); }`,
      ),
      options("never"),
    );

    expect(result.html).not.toContain("fonts.example.com");
    expect(result.external_content.has_remote_fonts).toBe(true);
  });

  it("keeps head css data image urls so embedded artwork still renders", () => {
    const data_url =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
    const result = sanitize_html(
      head_style_email(`.a { background-image: url('${data_url}'); }`),
      options("never"),
    );

    expect(result.html).toContain("data:image/png");
  });

  it("keeps non-url head css declarations intact", () => {
    const result = sanitize_html(
      head_style_email(`.a { color: rgb(1, 2, 3); font-weight: bold; }`),
      options("never"),
    );

    expect(result.html).toContain("font-weight: bold");
    expect(result.html).toContain("rgb(1, 2, 3)");
  });

  it("leaves remote head css intact when the user has allowed all external content", () => {
    const result = sanitize_html(head_style_email(REMOTE_RULE), options("always"));

    expect(result.html).toContain("tracker.example.com");
  });
});
