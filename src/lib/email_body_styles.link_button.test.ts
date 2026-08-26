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
import { describe, it, expect } from "vitest";

import {
  build_forced_dark_mode_css,
  LINK_BUTTON_EXCLUDE,
  LINK_BUTTON_HOVER_SELECTOR,
} from "./email_body_styles";

const BUTTON_LINK =
  '<a href="https://example.test" style="display:inline-block;background:linear-gradient(to bottom,#6b8aff,#3b5ae8);color:#ffffff;">Review Security Settings</a>';
const PLAIN_LINK = '<a href="https://example.test">Manage in Settings</a>';
const BULLETPROOF_BUTTON =
  '<table><tr><td bgcolor="#3b5ae8"><a href="https://example.test" style="color:#ffffff;">Open</a></td></tr></table>';

function matches(html: string, selector: string): boolean {
  const doc = new DOMParser().parseFromString(html, "text/html");

  return doc.querySelector(selector) !== null;
}

describe("link button selectors", () => {
  it("excludes a background-styled link from forced link colors", () => {
    expect(matches(BUTTON_LINK, `a${LINK_BUTTON_EXCLUDE}`)).toBe(false);
  });

  it("still targets ordinary links", () => {
    expect(matches(PLAIN_LINK, `a${LINK_BUTTON_EXCLUDE}`)).toBe(true);
  });

  it("targets both button shapes for the hover affordance", () => {
    const hover_selector = LINK_BUTTON_HOVER_SELECTOR.split(":hover").join("");

    expect(matches(BUTTON_LINK, hover_selector)).toBe(true);
    expect(matches(BULLETPROOF_BUTTON, hover_selector)).toBe(true);
    expect(matches(PLAIN_LINK, hover_selector)).toBe(false);
  });

  it("keeps forced dark mode away from button link text", () => {
    const css = build_forced_dark_mode_css("#3b82f6", "#60a5fa");

    expect(css).toContain(`a${LINK_BUTTON_EXCLUDE}, a${LINK_BUTTON_EXCLUDE} *`);
    expect(css).not.toMatch(/\na, a \* \{/);
    expect(css).toContain(
      'a[style*="background" i] *, [bgcolor] > a * { color: inherit !important; }',
    );
  });
});
