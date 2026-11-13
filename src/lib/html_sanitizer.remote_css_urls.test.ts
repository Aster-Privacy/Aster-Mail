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
    const result = sanitize_html(
      head_style_email(REMOTE_RULE),
      options("never"),
    );

    expect(result.html).not.toContain("tracker.example.com");
  });

  it("strips remote url() from body css when blocking is on", () => {
    const result = sanitize_html(
      body_style_email(REMOTE_RULE),
      options("never"),
    );

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

  it("routes head css url() images through the proxy when only remote css is blocked", () => {
    const result = sanitize_html(
      head_style_email(REMOTE_RULE),
      options("always", {
        block_remote_images: false,
        block_remote_fonts: false,
        block_remote_css: true,
        block_tracking_pixels: false,
      }),
    );

    expect(result.html).toContain(
      `https://proxy.example.com/img?url=${encodeURIComponent(TRACKER)}`,
    );
    expect(result.html).not.toContain(`url(${TRACKER}`);
    expect(result.external_content.blocked_count).toBe(0);
  });

  it("strips head css url() when only remote css is blocked and no proxy exists", () => {
    const result = sanitize_html(head_style_email(REMOTE_RULE), {
      ...options("always", {
        block_remote_images: false,
        block_remote_fonts: false,
        block_remote_css: true,
        block_tracking_pixels: false,
      }),
      image_proxy_url: undefined,
    });

    expect(result.html).not.toContain("tracker.example.com");
  });

  it("strips remote head css url() in lockdown mode regardless of preferences", () => {
    const result = sanitize_html(
      head_style_email(REMOTE_RULE),
      options("always", undefined, true),
    );

    expect(result.html).not.toContain("tracker.example.com");
  });

  it("reports blocked head css images as images so loading images restores them", () => {
    const result = sanitize_html(
      head_style_email(REMOTE_RULE),
      options("never"),
    );

    expect(result.external_content.has_remote_images).toBe(true);
    expect(
      result.external_content.blocked_items.some(
        (item) =>
          item.type === "image" &&
          new URL(item.url).hostname === "tracker.example.com",
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
    const result = sanitize_html(
      head_style_email(REMOTE_RULE),
      options("always"),
    );

    expect(result.html).toContain("tracker.example.com");
  });

  it("processes a malformed unterminated url() in reasonable time", () => {
    const evil = `.a { background-image: url(${" ".repeat(60000)}`;
    const started = Date.now();

    sanitize_html(head_style_email(evil), options("never"));
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(4000);
  });

  it("strips a terminated tracker url padded with whitespace in reasonable time", () => {
    const evil = `.a { background-image: url(${TRACKER}${" ".repeat(60000)}); }`;
    const started = Date.now();
    const result = sanitize_html(head_style_email(evil), options("never"));
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(4000);
    expect(result.html).not.toContain("tracker.example.com");
  });

  it("strips a remote url() hidden behind a css comment inside the parens", () => {
    const result = sanitize_html(
      head_style_email(`.a { background-image: url(/*c*/"${TRACKER}"); }`),
      options("never"),
    );

    expect(result.html).not.toContain("tracker.example.com");
  });

  it("strips a remote url() hidden behind a css comment before the parens", () => {
    const result = sanitize_html(
      head_style_email(`.a { background-image: url/*c*/("${TRACKER}"); }`),
      options("never"),
    );

    expect(result.html).not.toContain("tracker.example.com");
  });

  it("removes remote @font-face when a comment splits the at-rule", () => {
    const result = sanitize_html(
      head_style_email(
        `@font-face/*c*/{ font-family: x; src: url(https://fonts.example.com/x.woff2); }`,
      ),
      options("never"),
    );

    expect(result.html).not.toContain("fonts.example.com");
  });

  it("keeps a comment-like sequence inside a quoted css string", () => {
    const result = sanitize_html(
      head_style_email(`.a { color: red; font-family: "a/*b*/c"; }`),
      options("never"),
    );

    expect(result.html).toContain("a/*b*/c");
  });

  it("keeps cid url() references so inline attachment images still render", () => {
    const result = sanitize_html(
      head_style_email(`.a { background-image: url(cid:logo123@aster); }`),
      options("never"),
    );

    expect(result.html).toContain("cid:logo123@aster");
  });

  it("keeps blob url() references produced by the cid resolver", () => {
    const result = sanitize_html(
      head_style_email(
        `.a { background-image: url(blob:https://app.example/abc); }`,
      ),
      options("never"),
    );

    expect(result.html).toContain("blob:https://app.example/abc");
  });

  it("processes many url() declarations with trailing junk in reasonable time", () => {
    const evil = Array.from(
      { length: 400 },
      () => `.x { background: url(https://a.example${" ".repeat(200)}`,
    ).join("\n");
    const started = Date.now();

    sanitize_html(head_style_email(evil), options("never"));
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(4000);
  });
});

describe("remote css urls when remote content is allowed", () => {
  const SAME_ORIGIN_PROXY = "/api/images/v1/proxy";
  const PROXIED = `${SAME_ORIGIN_PROXY}?url=${encodeURIComponent(TRACKER)}`;
  const FONT = "https://fonts.example.com/a.woff2";

  const allowed_options = (): SanitizeOptions => ({
    external_content_mode: "always",
    sandbox_mode: true,
    image_proxy_url: SAME_ORIGIN_PROXY,
  });

  it("routes head css url() through the proxy", () => {
    const result = sanitize_html(
      head_style_email(REMOTE_RULE),
      allowed_options(),
    );

    expect(result.html).toContain(PROXIED);
    expect(result.html).not.toContain(`url(${TRACKER}`);
  });

  it("routes body css url() through the proxy", () => {
    const result = sanitize_html(
      body_style_email(REMOTE_RULE),
      allowed_options(),
    );

    expect(result.html).toContain(PROXIED);
    expect(result.html).not.toContain(`url(${TRACKER}`);
  });

  it("routes inline style url() through the proxy", () => {
    const result = sanitize_html(
      inline_style_email(`background-image: url(${TRACKER})`),
      allowed_options(),
    );

    expect(result.html).toContain(PROXIED);
    expect(result.html).not.toContain(`url(${TRACKER}`);
  });

  it("routes @font-face sources through the font proxy", () => {
    const result = sanitize_html(
      head_style_email(
        `@font-face { font-family: brand; src: url(${FONT}); } ${REMOTE_RULE}`,
      ),
      allowed_options(),
    );

    expect(result.html).toContain(
      `/api/content/v1/proxy?url=${encodeURIComponent(FONT)}&content_type=font`,
    );
    expect(result.html).not.toContain(`url(${FONT})`);
    expect(result.html).toContain(PROXIED);
  });

  it("drops @font-face sources when no font proxy can be derived", () => {
    const result = sanitize_html(
      head_style_email(`@font-face { font-family: brand; src: url(${FONT}); }`),
      {
        ...allowed_options(),
        image_proxy_url: "https://proxy.example.com/img",
      },
    );

    expect(result.html).not.toContain("fonts.example.com");
  });

  it("routes css url() through a proxy on another origin", () => {
    const result = sanitize_html(head_style_email(REMOTE_RULE), {
      ...allowed_options(),
      image_proxy_url: "https://app.astermail.org/api/images/v1/proxy",
    });

    expect(result.html).toContain(
      `https://app.astermail.org/api/images/v1/proxy?url=${encodeURIComponent(TRACKER)}`,
    );
    expect(result.html).not.toContain(`url(${TRACKER}`);
  });

  it("does not treat @font-face inside a selector string as a font rule", () => {
    const result = sanitize_html(
      head_style_email(
        `.a[title="@font-face{"] { background-image: url(${TRACKER}); }`,
      ),
      allowed_options(),
    );

    expect(result.html).not.toContain(`url(${TRACKER}`);
  });

  it("does not let a brace inside a font-face string hide later rules", () => {
    const result = sanitize_html(
      head_style_email(
        `@font-face { font-family: "{"; src: url(${FONT}); } ${REMOTE_RULE}`,
      ),
      allowed_options(),
    );

    expect(result.html).not.toContain(`url(${TRACKER}`);
    expect(result.html).toContain(PROXIED);
  });
});

describe("remote css images follow the image decision", () => {
  const PROXY = "https://proxy.example.com/img";
  const PROXIED = `${PROXY}?url=${encodeURIComponent(TRACKER)}`;
  const images_allowed_css_blocked: SanitizeOptions["content_blocking"] = {
    block_remote_images: false,
    block_remote_fonts: true,
    block_remote_css: true,
    block_tracking_pixels: true,
  };
  const images_blocked_css_allowed: SanitizeOptions["content_blocking"] = {
    block_remote_images: true,
    block_remote_fonts: true,
    block_remote_css: false,
    block_tracking_pixels: true,
  };

  it.each([
    ["head", head_style_email(REMOTE_RULE)],
    ["body", body_style_email(REMOTE_RULE)],
    ["inline", inline_style_email(`background-image: url(${TRACKER})`)],
  ])(
    "proxies %s css background images once images are allowed",
    (_place, html) => {
      const result = sanitize_html(
        html,
        options("ask", images_allowed_css_blocked),
      );

      expect(result.html).toContain(PROXIED);
      expect(result.html).not.toContain(`url(${TRACKER}`);
      expect(
        result.external_content.blocked_items.some(
          (item) => item.url === TRACKER,
        ),
      ).toBe(false);
    },
  );

  it.each([
    ["head", head_style_email(REMOTE_RULE)],
    ["body", body_style_email(REMOTE_RULE)],
    ["inline", inline_style_email(`background-image: url(${TRACKER})`)],
  ])(
    "counts blocked %s css background images as images",
    (_place, html) => {
      const result = sanitize_html(
        html,
        options("ask", images_blocked_css_allowed),
      );

      expect(result.html).not.toContain("tracker.example.com");
      expect(result.external_content.has_remote_images).toBe(true);
      expect(result.external_content.has_remote_css).toBe(false);
      expect(result.external_content.blocked_items).toContainEqual({
        url: TRACKER,
        type: "image",
      });
    },
  );

  it("keeps css background images blocked in lockdown mode", () => {
    const result = sanitize_html(
      head_style_email(REMOTE_RULE),
      options("always", images_allowed_css_blocked, true),
    );

    expect(result.html).not.toContain("tracker.example.com");
  });

  it("still blocks remote fonts when images are allowed", () => {
    const result = sanitize_html(
      head_style_email(
        `@font-face { font-family: x; src: url(https://fonts.example.com/x.woff2); } ${REMOTE_RULE}`,
      ),
      options("ask", images_allowed_css_blocked),
    );

    expect(result.html).not.toContain("fonts.example.com");
    expect(result.html).toContain(PROXIED);
  });

  it("still drops @import when images are allowed", () => {
    const result = sanitize_html(
      head_style_email(
        `@import url(https://styles.example.com/a.css); ${REMOTE_RULE}`,
      ),
      options("ask", images_allowed_css_blocked),
    );

    expect(result.html).not.toContain("styles.example.com");
  });
});
