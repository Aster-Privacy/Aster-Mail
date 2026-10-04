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

const DARK_RULE = ".text{color:#f5f5f5 !important}";
const BASE_RULE = ".text{color:#222222}";

function sanitize(html: string): string {
  return sanitize_html(html, {
    external_content_mode: "always",
    sandbox_mode: true,
  }).html;
}

function in_head(media_attribute: string, css: string): string {
  return `<html><head><style>${BASE_RULE}</style><style ${media_attribute}>${css}</style></head><body><p class="text">Hello</p></body></html>`;
}

function in_body(media_attribute: string, css: string): string {
  return `<style>${BASE_RULE}</style><style ${media_attribute}>${css}</style><p class="text">Hello</p>`;
}

function squash(html: string): string {
  return html.replace(/\s+/g, " ");
}

describe.each([
  ["head", in_head],
  ["body", in_body],
])("style media attribute in the %s", (_place, build) => {
  it.each([
    'media="(prefers-color-scheme: dark)"',
    "media='screen and (prefers-color-scheme: dark)'",
    "media=(prefers-color-scheme:dark)",
    'media="only screen and (prefers-color-scheme: dark), (prefers-color-scheme: dark) and (max-width: 600px)"',
    'MEDIA="SCREEN AND (PREFERS-COLOR-SCHEME: DARK)"',
  ])("drops a dark-only style block for %s", (attribute) => {
    const html = sanitize(build(attribute, DARK_RULE));

    expect(html).not.toContain("#f5f5f5");
    expect(html).toContain(BASE_RULE);
  });

  it("keeps a light-only style block scoped to its query", () => {
    const html = squash(
      sanitize(build('media="(prefers-color-scheme: light)"', DARK_RULE)),
    );

    expect(html).toContain(
      `@media (prefers-color-scheme: light) { ${DARK_RULE} }`,
    );
  });

  it("keeps a print style block from applying on screen", () => {
    const html = squash(sanitize(build('media="print"', DARK_RULE)));

    expect(html).toContain(`@media print { ${DARK_RULE} }`);
  });

  it("removes only the dark query from a mixed media list", () => {
    const html = squash(
      sanitize(
        build(
          'media="print, screen and (prefers-color-scheme: dark)"',
          DARK_RULE,
        ),
      ),
    );

    expect(html).toContain(`@media print { ${DARK_RULE} }`);
    expect(html).not.toMatch(/prefers-color-scheme/i);
  });

  it("keeps a negated dark query", () => {
    const html = squash(
      sanitize(
        build('media="not all and (prefers-color-scheme: dark)"', DARK_RULE),
      ),
    );

    expect(html).toContain(
      `@media not all and (prefers-color-scheme: dark) { ${DARK_RULE} }`,
    );
  });

  it("leaves a style block without a media attribute unwrapped", () => {
    const html = sanitize(build('title="plain"', DARK_RULE));

    expect(html).toContain(DARK_RULE);
    expect(html).not.toContain("@media");
  });

  it.each([
    'media="all{} .text{color:#f5f5f5}"',
    'media="screen; color:#f5f5f5"',
    'media="all&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"',
    'media="all\\7b"',
  ])(
    "drops a style block whose media value is not a plain query: %s",
    (attribute) => {
      const html = sanitize(build(attribute, DARK_RULE));

      expect(html).not.toContain("#f5f5f5");
      expect(html).not.toContain("onerror");
      expect(html).toContain(BASE_RULE);
    },
  );
});
