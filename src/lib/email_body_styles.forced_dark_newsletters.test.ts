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
import { describe, it, expect, afterEach } from "vitest";

import { build_forced_dark_mode_css } from "@/lib/email_body_styles";
import { sanitize_html } from "@/lib/html_sanitizer";

const OPTIONS = {
  external_content_mode: "never" as const,
  sandbox_mode: true,
};

const NEUTRALIZE_RULE = "background-color: transparent !important;";

const EXCLUDED_ATTRIBUTE = /:not\(\[([\w-]+)(?:\*="([^"]*)"(\s+i)?)?\]\)/g;

function neutralize_selectors(): string[] {
  const css = build_forced_dark_mode_css();
  const start = css.indexOf("div:not(");
  const end = css.lastIndexOf("{", css.indexOf(NEUTRALIZE_RULE, start));

  return css
    .slice(start, end)
    .split(",")
    .map((selector) => selector.trim());
}

function matches_attribute(
  element: Element,
  name: string,
  needle: string | undefined,
  ignore_case: boolean,
): boolean {
  const value = element.getAttribute(name);

  if (value === null) return false;
  if (needle === undefined) return true;

  return ignore_case
    ? value.toLowerCase().includes(needle.toLowerCase())
    : value.includes(needle);
}

function is_flattened(element: Element | null): boolean {
  if (!element) throw new Error("element not found");

  const tag = element.tagName.toLowerCase();
  const selector = neutralize_selectors().find((entry) =>
    entry.startsWith(`${tag}:`),
  );

  if (!selector) return false;

  for (const clause of selector.matchAll(EXCLUDED_ATTRIBUTE)) {
    if (matches_attribute(element, clause[1], clause[2], !!clause[3])) {
      return false;
    }
  }

  return true;
}

const mounted: HTMLElement[] = [];

function render(html: string): HTMLElement {
  const root = document.createElement("div");

  root.innerHTML = sanitize_html(html, OPTIONS).html;
  document.body.appendChild(root);
  mounted.push(root);

  return root;
}

afterEach(() => {
  mounted.splice(0).forEach((root) => root.remove());
});

describe("forced dark mode on newsletter layouts", () => {
  it("flattens a white wrapper that resets its background image", () => {
    const root = render(
      '<table class="wrapper" width="100%" style="background-color:#ffffff;background-image:none;background-repeat:no-repeat"><tr><td>Weekly offers from example.com</td></tr></table>',
    );

    expect(is_flattened(root.querySelector("table.wrapper"))).toBe(true);
  });

  it("flattens a wrapper whose reset is marked important", () => {
    const root = render(
      '<div class="wrapper" style="background-color:#ffffff;background-image: none !important">Weekly offers</div>',
    );

    expect(is_flattened(root.querySelector("div.wrapper"))).toBe(true);
  });

  it("keeps a cell that paints an inline background image", () => {
    const root = render(
      '<table><tr><td class="hero" style="background-color:#ffffff;background-image:url(cid:hero@example.com)">Autumn sale</td></tr></table>',
    );

    expect(is_flattened(root.querySelector("td.hero"))).toBe(false);
  });

  it("keeps a cell that paints an inline gradient", () => {
    const root = render(
      '<table><tr><td class="hero" style="background-image:linear-gradient(#ffffff, #eeeeee)">Autumn sale</td></tr></table>',
    );

    expect(is_flattened(root.querySelector("td.hero"))).toBe(false);
  });

  it("flattens a mid grey page behind a white card", () => {
    const root = render(
      '<html><body style="background:#bbbbbb"><center class="page" style="background:#bbbbbb">' +
        '<table class="header" width="100%" style="background:#000000"><tr><td><a href="https://example.com">Example Store</a></td></tr></table>' +
        '<table class="card" width="650" style="background:#ffffff"><tr><td style="color:#2d4450">New releases this week</td></tr></table>' +
        "</center></body></html>",
    );

    expect(is_flattened(root.querySelector("center.page"))).toBe(true);
    expect(is_flattened(root.querySelector("table.card"))).toBe(true);
    expect(is_flattened(root.querySelector("table.header"))).toBe(false);
  });
});
