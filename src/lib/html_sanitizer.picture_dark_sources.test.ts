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

const DARK = "https://cdn.example.test/logo-dark.png";
const LIGHT = "https://cdn.example.test/logo-light.png";
const FALLBACK = "https://cdn.example.test/logo.png";
const proxy = "https://proxy.example.test/img";

function picture(sources: string): string {
  return `<picture>${sources}<img src="${FALLBACK}" width="120" height="40" alt="Logo"></picture>`;
}

function sanitize(html: string, options: SanitizeOptions = {}): Document {
  const result = sanitize_html(html, {
    external_content_mode: "always",
    ...options,
  });

  return new DOMParser().parseFromString(result.html, "text/html");
}

describe("picture sources for the dark color scheme", () => {
  it.each([
    "(prefers-color-scheme: dark)",
    "screen and (prefers-color-scheme: dark)",
    "(PREFERS-COLOR-SCHEME:DARK)",
    "(prefers-color-scheme: dark), only screen and (prefers-color-scheme: dark) and (max-width: 600px)",
  ])("drops a source whose media is %s", (media) => {
    const doc = sanitize(
      picture(
        `<source media="${media}" srcset="${DARK}"><source media="(prefers-color-scheme: light)" srcset="${LIGHT}">`,
      ),
    );
    const sources = Array.from(doc.querySelectorAll("source"));

    expect(doc.body.innerHTML).not.toContain(DARK);
    expect(sources.map((source) => source.getAttribute("srcset"))).toEqual([
      LIGHT,
    ]);
    expect(doc.querySelector("img")?.getAttribute("src")).toBe(FALLBACK);
  });

  it("keeps light and unrelated sources untouched", () => {
    const doc = sanitize(
      picture(
        `<source media="(prefers-color-scheme: light)" srcset="${LIGHT}"><source media="(min-width: 600px)" srcset="${LIGHT} 2x"><source type="image/webp" srcset="${LIGHT}"><source media="not all and (prefers-color-scheme: dark)" srcset="${LIGHT}">`,
      ),
    );

    expect(
      Array.from(doc.querySelectorAll("source")).map((source) =>
        source.getAttribute("media"),
      ),
    ).toEqual([
      "(prefers-color-scheme: light)",
      "(min-width: 600px)",
      null,
      "not all and (prefers-color-scheme: dark)",
    ]);
  });

  it("removes only the dark query from a mixed media list", () => {
    const doc = sanitize(
      picture(
        `<source media="(max-width: 600px), (prefers-color-scheme: dark)" srcset="${LIGHT}">`,
      ),
    );

    expect(doc.querySelector("source")?.getAttribute("media")).toBe(
      "(max-width: 600px)",
    );
  });

  it("drops the dark source when images are proxied", () => {
    const doc = sanitize(
      picture(
        `<source media="(prefers-color-scheme: dark)" srcset="${DARK}"><source srcset="${LIGHT}">`,
      ),
      { image_proxy_url: proxy },
    );
    const sources = Array.from(doc.querySelectorAll("source"));

    expect(doc.body.innerHTML).not.toContain(encodeURIComponent(DARK));
    expect(sources).toHaveLength(1);
    expect(sources[0].getAttribute("srcset")).toBe(
      `${proxy}?url=${encodeURIComponent(LIGHT)}`,
    );
  });

  it("does not count a dropped dark source as a blocked image", () => {
    const result = sanitize_html(
      picture(
        `<source media="(prefers-color-scheme: dark)" srcset="${DARK}"><source srcset="${LIGHT}">`,
      ),
      { external_content_mode: "never" },
    );
    const doc = new DOMParser().parseFromString(result.html, "text/html");

    expect(doc.querySelector('source[media*="dark"]')).toBeNull();
    expect(
      result.external_content.blocked_items.map((item) => item.url),
    ).not.toContain(DARK);
    for (const element of Array.from(doc.querySelectorAll("source, img"))) {
      for (const name of ["src", "srcset"]) {
        expect(element.getAttribute(name) ?? "").not.toMatch(/https?:\/\//);
      }
    }
  });
});
